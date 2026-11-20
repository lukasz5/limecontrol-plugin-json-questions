<?php
// SPDX-License-Identifier: GPL-2.0-or-later

require_once __DIR__ . '/LimeControlJsonModel.php';
require_once __DIR__ . '/LimeControlJsonContext.php';
require_once __DIR__ . '/LimeControlJsonAdmin.php';

class LimeControlJsonQuestions extends PluginBase
{
    protected static $name = 'LimeControlJsonQuestions';
    protected static $description = 'Configure dependent JSON questions and export their answers.';
    protected $storage = 'DbStorage';
    private static $surveyId = 0;

    public function init()
    {
        foreach (['newQuestionAttributes', 'beforeSurveyActivate', 'beforeQuestionRender', 'beforeSurveyPage',
            'ExpressionManagerStart', 'beforeToolsMenuRender', 'newDirectRequest', 'beforeDeactivate'] as $event) {
            $this->subscribe($event);
        }
    }

    public function newQuestionAttributes()
    {
        $attributes = [];
        foreach ([LimeControlJsonContext::DEF, LimeControlJsonContext::HISTORY, LimeControlJsonContext::DETACHED] as $key) {
            $attributes[$key] = ['types'=>'U', 'category'=>'LimeControl JSON', 'sortorder'=>10,
                'inputtype'=>'none', 'default'=>'', 'i18n'=>false, 'expression'=>0, 'xssfilter'=>false,
                'caption'=>$key, 'help'=>'LimeControl JSON'];
        }
        $this->getEvent()->append('questionAttributes', $attributes);
    }

    public function ExpressionManagerStart()
    {
        $this->getEvent()->append('functions', ['lcjqValid' => [
            '\\LimeControlJsonQuestions::validateExpression', 'lcjqValid',
            'Validate a LimeControl JSON block', 'lcjqValid(answer, questionCode, SID)',
            '', 3,
        ]]);
    }

    public static function validateExpression($raw, $code, $sid)
    {
        if (!self::$surveyId || self::$surveyId !== (int)$sid || !is_scalar($raw) && $raw !== null || !is_string($code)) {
            return false;
        }
        $ctx = LimeControlJsonContext::get((int)$sid);
        if ($ctx->kind($code) === false) {
            return false;
        }
        $values = $ctx->currentValues();
        $field = $ctx->fieldName($code);
        $previous = self::decode($values[$field] ?? '');
        // ExpressionScript escapes braces and ampersands in text values (.NAOK). Restore exactly one escaping layer.
        $answer = self::decode($raw);
        if ($answer === null && is_string($raw)) {
            $answer = self::decode(html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }
        if ($answer === null) {
            return false;
        }
        $definition = $ctx->responseDefinition($code, !empty($answer['rows']) ? $answer : ($previous ?: $answer));
        if (!$definition) {
            return false;
        }
        if (($raw === '' || $raw === null) && isset($definition['revision'])) {
            $answer['revision'] = $definition['revision'];
        }
        $sources = $ctx->sourceContext($definition, $values);
        return LimeControlJsonModel::validateAnswer($definition, $answer, $sources['sources']) === [];
    }

    private static function decode($raw)
    {
        if ($raw === '' || $raw === null) {
            return ['version' => 1, 'rows' => []];
        }
        if (!is_string($raw) || strlen($raw) > 2097152) {
            return null;
        }
        $answer = json_decode($raw, true, 32);
        if (!is_array($answer) || ($answer['version'] ?? null) !== 1 || !isset($answer['rows'])
            || !is_array($answer['rows']) || (isset($answer['revision']) && !is_string($answer['revision']))) {
            return null;
        }
        return $answer;
    }

    public function beforeSurveyPage()
    {
        self::$surveyId = (int)$this->getEvent()->get('surveyId');
        if (!self::$surveyId || !App()->request->isPostRequest) {
            return;
        }
        $ctx = LimeControlJsonContext::get(self::$surveyId);
        foreach ($ctx->questions as $code => $question) {
            if ($ctx->kind($code) === false) {
                continue;
            }
            $name = $ctx->fieldName($code);
            if (!$name || !array_key_exists($name, $_POST)) {
                continue;
            }
            $raw = $_POST[$name];
            if (is_string($raw) && strlen($raw) > $ctx->maxBytes($code)) {
                throw new CHttpException(422, LimeControlJsonAdmin::message('size') . ' (' . $code . ')');
            }
            $answer = self::decode($raw);
            if ($answer === null) {
                throw new CHttpException(422, LimeControlJsonAdmin::errors(['answer.format']) . ' (' . $code . ')');
            }
            if ($raw === '') {
                continue;
            }
            $values = $ctx->currentValues();
            $old = self::decode($values[$name] ?? null);
            $definition = $ctx->responseDefinition($code, $old ?: []);
            if (!$definition || isset($answer['revision']) && ($definition['revision'] ?? null) !== $answer['revision']) {
                throw new CHttpException(422, LimeControlJsonAdmin::errors(['answer.revision']) . ' (' . $code . ')');
            }
            if (!empty($definition['revision']) && !isset($answer['revision'])) {
                $answer['revision'] = $definition['revision'];
                $_POST[$name] = json_encode($answer, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if (strlen($_POST[$name]) > $ctx->maxBytes($code)) {
                    throw new CHttpException(422, LimeControlJsonAdmin::message('size') . ' (' . $code . ')');
                }
            }
            // Validate values/types independently of page order: the preceding source might be posted on this page.
            // Relevance, legitimate source paths and required cells are checked by EM after it processes POST.
            $rows = [];
            foreach ($answer['rows'] as $row) {
                if (is_array($row) && isset($row['path'])) {
                    $rows[] = ['path' => $row['path']];
                }
            }
            $technicalDefinition = $definition;
            $technicalDefinition['rules'] = [];
            $technical = array_intersect(['answer.type','answer.format','answer.path','answer.revision'],
                LimeControlJsonModel::validateAnswer($technicalDefinition, $answer, [$definition['source'] => $rows]));
            if ($technical) {
                throw new CHttpException(422, LimeControlJsonAdmin::errors($technical) . ' (' . $code . ')');
            }
        }
    }

    public function beforeQuestionRender()
    {
        $event = $this->getEvent();
        if ($event->get('type') !== 'U') {
            return;
        }
        $sid = (int)$event->get('surveyId');
        $ctx = LimeControlJsonContext::get($sid);
        $code = $event->get('code');
        if (!isset($ctx->questions[$code]) || $ctx->kind($code) === false) {
            return;
        }
        $name = $ctx->fieldName($code);
        $values = $ctx->currentValues();
        $old = self::decode($values[$name] ?? '');
        $definition = $ctx->responseDefinition($code, $old ?: []);
        if (!$definition || $ctx->definitionErrors($code, $definition, false)) {
            $event->set('answers', CHtml::tag('p', ['role'=>'alert'], CHtml::encode(LimeControlJsonAdmin::message('invalid'))));
            return;
        }
        $config = $ctx->sourceContext($definition, $values) + ['definition'=>$definition, 'language'=>$ctx->language,
            'fieldName'=>$name, 'questionCode'=>$code, 'maxBytes'=>$ctx->maxBytes($code), 'surveyId'=>$sid, 'mandatory'=>$ctx->questions[$code]['mandatory'] === 'Y'];
        $assets = App()->assetManager->publish(__DIR__ . '/assets');
        App()->clientScript->registerScriptFile($assets . '/respondent.js', CClientScript::POS_END);
        App()->clientScript->registerCssFile($assets . '/respondent.css');
        $event->set('answers', CHtml::tag('div', ['class'=>'lcjq-block','data-lcjq-kind'=>$definition['kind'],
            'data-lcjq'=>json_encode($config, JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_INVALID_UTF8_SUBSTITUTE)], $event->get('answers')));
    }

    public function beforeSurveyActivate()
    {
        $event = $this->getEvent();
        $ctx = LimeControlJsonContext::get((int)$event->get('surveyId'));
        $errors = [];
        foreach ($ctx->questions as $code => $question) {
            if ($ctx->kind($code) === false && $ctx->attribute($question['qid'], LimeControlJsonContext::DEF) === '') {
                continue;
            }
            $definition = $ctx->definition($code);
            if (!$definition || $ctx->kind($code) !== ($definition['kind'] ?? null)
                || !LimeControlJsonAdmin::themeExists($question['question_theme_name'])
                || strpos($ctx->attribute($question['qid'], 'em_validation_q'), LimeControlJsonContext::equation($code)) === false
                || $ctx->definitionErrors($code, $definition)) {
                $errors[] = CHtml::encode($code);
            }
        }
        if ($errors) {
            $event->set('success', false);
            $event->set('message', LimeControlJsonAdmin::message('fix') . ' ' . implode(', ', $errors));
        }
    }

    public function beforeDeactivate()
    {
        $inUse = App()->db->createCommand()->select('a.qid')->from('{{question_attributes}} a')
            ->join('{{questions}} q', 'q.qid=a.qid')->where('a.attribute=:name AND a.value LIKE :function',
            [':name'=>'em_validation_q', ':function'=>'%lcjqValid(%'])->limit(1)->queryScalar();
        if ($inUse !== false) {
            $this->getEvent()->set('success', false);
            $this->getEvent()->set('message', LimeControlJsonAdmin::message('detachFirst'));
        }
    }

    public function beforeToolsMenuRender()
    {
        $event = $this->getEvent();
        $sid = (int)$event->get('surveyId');
        if (!$sid || App()->user->isGuest) {
            return;
        }
        $items = $event->get('menuItems') ?: [];
        foreach (['editor'=>['surveycontent','update'], 'export'=>['responses','export'], 'dictionary'=>['responses','export'], 'legacy'=>['responses','export']] as $action=>$permission) {
            if (Permission::model()->hasSurveyPermission($sid, $permission[0], $permission[1])
                && ($action === 'editor' || Permission::model()->hasSurveyPermission($sid,'responses','read'))) {
                $items[] = new \LimeSurvey\Menu\MenuItem(['label'=>LimeControlJsonAdmin::message($action),
                    'href'=>CHtml::encode(LimeControlJsonAdmin::url($action, $sid))]);
            }
        }
        $event->set('menuItems', $items);
    }

    public function newDirectRequest()
    {
        $event = $this->getEvent();
        if ($event->get('target') !== self::$name) {
            return;
        }
        LimeControlJsonAdmin::dispatch($event->get('function'));
    }
}
