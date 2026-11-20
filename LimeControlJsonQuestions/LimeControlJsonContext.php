<?php
// SPDX-License-Identifier: GPL-2.0-or-later

/** Survey-scoped LS 6/7 adapter. Never derives question codes by splitting an SGQA name. */
final class LimeControlJsonContext
{
    const THEMES = ['choice' => 'LcJsonChoice', 'matrix' => 'LcJsonMatrix', 'followup' => 'LcJsonFollowup'];
    const DEF = 'lcjq_definition';
    const HISTORY = 'lcjq_history';
    const DETACHED = 'lcjq_detached';
    private static $instances = [];
    public $survey;
    public $language;
    public $questions = [];
    private $attributes = [];
    private $fields;

    public static function get($sid, $language = null)
    {
        $key = (int)$sid . ':' . ($language ?: App()->language);
        if (!isset(self::$instances[$key])) {
            self::$instances[$key] = new self($sid, $language ?: App()->language);
        }
        return self::$instances[$key];
    }

    public static function clear()
    {
        self::$instances = [];
    }

    private function __construct($sid, $language)
    {
        $this->survey = Survey::model()->findByPk((int)$sid);
        if (!$this->survey) {
            throw new CHttpException(404);
        }
        $this->language = in_array($language, $this->survey->allLanguages, true) ? $language : $this->survey->language;
        $questions = App()->db->createCommand()->select('q.qid, q.gid, q.sid, q.title, q.type, q.question_theme_name, q.mandatory, q.encrypted')
            ->from('{{questions}} q')->join('{{groups}} g', 'g.gid=q.gid AND g.sid=q.sid')
            ->where('q.sid=:sid AND q.parent_qid=0', [':sid' => (int)$sid])
            ->order('g.group_order, q.question_order, q.qid')->queryAll();
        foreach ($questions as $q) {
            $this->questions[$q['title']] = $q;
        }
        $rows = App()->db->createCommand()->select('a.qid, a.attribute, a.value, a.language')->from('{{question_attributes}} a')
            ->join('{{questions}} q', 'q.qid=a.qid')
            ->where(['and', 'q.sid=:sid', ['in', 'a.attribute', [self::DEF, self::HISTORY, self::DETACHED, 'em_validation_q']]], [':sid'=>(int)$sid])
            ->queryAll();
        foreach ($rows as $row) {
            if (empty($row['language'])) {
                $this->attributes[(int)$row['qid']][$row['attribute']] = $row['value'];
            }
        }
    }

    public function attribute($qid, $key)
    {
        return $this->attributes[(int)$qid][$key] ?? '';
    }

    public function definition($code, $revision = null)
    {
        if (!isset($this->questions[$code])) {
            return [];
        }
        $qid = $this->questions[$code]['qid'];
        $def = json_decode($this->attribute($qid, self::DEF), true) ?: [];
        if (!$revision || ($def['revision'] ?? null) === $revision) {
            return $def;
        }
        $history = json_decode($this->attribute($qid, self::HISTORY), true) ?: [];
        return $history[$revision] ?? [];
    }

    public function responseDefinition($code, array $answer)
    {
        $qid = (int)($this->questions[$code]['qid'] ?? 0);
        if (!$qid) { return []; }
        $revision = $answer['revision'] ?? null;
        if ($revision !== null && !is_string($revision)) { return []; }
        $current = $this->definition($code);
        $detached = json_decode($this->attribute($qid, self::DETACHED), true) ?: [];
        $history = json_decode($this->attribute($qid, self::HISTORY), true) ?: [];
        if (!$revision) {
            return ($answer['rows'] ?? []) && isset($history['_initial']) ? $history['_initial'] : ($current ?: $detached);
        }
        foreach ([$current, $detached] as $definition) {
            if (($definition['revision'] ?? null) === $revision) { return $definition; }
        }
        return $history[$revision] ?? [];
    }

    public function kind($code)
    {
        return array_search($this->questions[$code]['question_theme_name'] ?? '', self::THEMES, true);
    }

    public function eligibleSources($code)
    {
        $out = [];
        foreach ($this->questions as $name => $question) {
            if ($name === $code) {
                break;
            }
            if (in_array($question['type'], ['L', '!', 'M', 'P'], true) || $this->kind($name) !== false) {
                $out[] = $name;
            }
        }
        return $out;
    }

    public function definitionErrors($code, array $definition)
    {
        $errors = LimeControlJsonModel::validateDefinition($definition);
        if (!in_array($definition['source'] ?? null, $this->eligibleSources($code), true)) {
            $errors[] = 'definition.source';
        }
        return array_values(array_unique($errors));
    }

    private function fieldMap()
    {
        if ($this->fields === null) {
            $this->fields = [];
            foreach (createFieldMap($this->survey, 'full', false, false, $this->language) as $f) {
                if (!empty($f['qid'])) {
                    $this->fields[(int)$f['qid']][] = $f;
                }
            }
        }
        return $this->fields;
    }

    public function fieldName($code)
    {
        $qid = (int)($this->questions[$code]['qid'] ?? 0);
        foreach ($this->fieldMap()[$qid] ?? [] as $field) {
            if ((string)$field['aid'] === '') {
                return $field['fieldname'];
            }
        }
        return '';
    }

    private function nativeChoices(array $question)
    {
        $fields = $this->fieldMap()[(int)$question['qid']] ?? [];
        $choices = [];
        if (in_array($question['type'], ['L', '!'], true)) {
            $name = $this->fieldName($question['title']);
            foreach (Answer::model()->findAllByAttributes(['qid' => $question['qid'], 'scale_id' => 0], ['order' => 'sortorder, aid']) as $option) {
                $code = (string)$option->code;
                $label = Answer::model()->getAnswerFromCode($question['qid'], $code, $this->language);
                $choices[] = ['fieldName' => $name, 'path' => [$code], 'label' => self::plain($label ?: $code), 'value' => $code];
            }
        } else {
            // Match against actual subquestion codes so LS auxiliary/free-comment fields cannot become rows.
            $codes = [];
            foreach (Question::model()->findAllByAttributes(['parent_qid' => $question['qid']]) as $sub) {
                $codes[(string)$sub->title] = true;
            }
            foreach ($fields as $field) {
                $code = (string)$field['aid'];
                if (isset($codes[$code])) {
                    $choices[] = ['fieldName' => $field['fieldname'], 'path' => [$code],
                        'label' => self::plain($field['subquestion'] ?? $code), 'value' => 'Y'];
                }
            }
        }
        return $choices;
    }

    private static function plain($label)
    {
        return trim(html_entity_decode(strip_tags((string)$label), ENT_QUOTES, 'UTF-8'));
    }

    public function sourceContext(array $definition, array $values)
    {
        $sources = $descriptors = $definitions = [];
        $source = $definition['source'] ?? '';
        while ($source !== '' && isset($this->questions[$source]) && !isset($sources[$source])) {
            $question = $this->questions[$source];
            if ($this->kind($source) === false) {
                $sources[$source] = [];
                $descriptors[$source] = $this->nativeChoices($question);
                foreach ($descriptors[$source] as $item) {
                    if (($values[$item['fieldName']] ?? null) === $item['value']) {
                        $sources[$source][] = ['path' => $item['path'], 'label' => $item['label']];
                    }
                }
                break;
            }
            $fieldName = $this->fieldName($source);
            $answer = json_decode((string)($values[$fieldName] ?? ''), true);
            $answer = is_array($answer) ? $answer : ['version' => 1, 'rows' => []];
            $upstream = $this->responseDefinition($source, $answer);
            $definitions[$source] = $upstream;
            $descriptors[$source] = [['fieldName' => $fieldName, 'path' => [], 'kind' => 'block']];
            $sources[$source] = $answer;
            $sources[$source]['definition'] = $upstream;
            $source = $upstream['source'] ?? '';
        }
        // Project oldest sources first so removal upstream propagates across unvisited pages.
        foreach (array_reverse(array_keys($definitions)) as $code) {
            $upstream = $definitions[$code];
            if ($upstream) {
                $projected = LimeControlJsonModel::activeAnswer($upstream, $sources[$code], $sources);
                $sources[$code] = $projected + ['definition' => $upstream];
            }
        }
        return ['sources' => $sources, 'sourceFields' => $descriptors, 'sourceDefinitions' => $definitions];
    }

    public function maxBytes($code)
    {
        if (App()->db->driverName !== 'mysql') {
            return 2097152;
        }
        $capacity = 65535;
        if ($this->survey->active === 'Y') {
            $column = Response::model((int)$this->survey->sid)->getTableSchema()->getColumn($this->fieldName($code));
            $type = strtolower($column->dbType ?? 'text');
            $capacity = ['tinytext'=>255, 'text'=>65535, 'mediumtext'=>16777215, 'longtext'=>4294967295][$type] ?? 65535;
        }
        if (($this->questions[$code]['encrypted'] ?? '') === 'Y') {
            // NaCl secretbox MAC and base64 expansion; leave space for format differences.
            $capacity = intdiv($capacity, 4) * 3 - 64;
        }
        return min(2097152, $capacity);
    }

    public function currentValues()
    {
        $sid = (int)$this->survey->sid;
        // LS7 separates interview navigation from answer data; LS6 stores both in survey_<sid>.
        return $_SESSION['responses_' . $sid] ?? $_SESSION['survey_' . $sid] ?? [];
    }

    public static function equation($code)
    {
        return 'lcjqValid(this.NAOK, "' . $code . '", SID)';
    }
}
