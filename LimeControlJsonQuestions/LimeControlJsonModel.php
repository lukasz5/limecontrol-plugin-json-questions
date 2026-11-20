<?php
// SPDX-License-Identifier: GPL-2.0-or-later

declare(strict_types=1);

/** The portable data contract. This class has no dependency on Yii or LimeSurvey. */
final class LimeControlJsonModel
{
    private const TYPES = ['single', 'multi', 'number', 'text'];
    private const EFFECTS = ['show', 'require', 'requireComment'];

    public static function validateDefinition(array $def): array
    {
        $errors = [];
        if (($def['version'] ?? null) !== 1 || !in_array($def['kind'] ?? '', ['choice', 'matrix', 'followup'], true)) {
            $errors[] = 'definition.version';
        }
        if (!self::code($def['source'] ?? null)) {
            $errors[] = 'definition.source';
        }
        $options = $def['options'] ?? null;
        if (!is_array($options) || !array_is_list($options) || !$options || count($options) > 256) {
            return array_merge($errors, ['definition.options']);
        }
        $codes = [];
        foreach ($options as $opt) {
            if (!is_array($opt) || !self::code($opt['code'] ?? null) || isset($codes[$opt['code']])
                || !in_array($opt['type'] ?? '', self::TYPES, true) || !is_array($opt['label'] ?? null)) {
                $errors[] = 'definition.option';
                continue;
            }
            $codes[$opt['code']] = true;
            $hasLabel = false;
            foreach ($opt['label'] as $label) {
                if (!is_string($label) || strlen($label) > 2048) {
                    $errors[] = 'definition.label';
                } elseif (trim($label) !== '') {
                    $hasLabel = true;
                }
            }
            if (!$hasLabel) {
                $errors[] = 'definition.label';
            }
            foreach (['exclusive','comment','required'] as $flag) {
                if (isset($opt[$flag]) && !is_bool($opt[$flag])) {
                    $errors[] = 'definition.option';
                }
            }
        }
        $rules = $def['rules'] ?? [];
        if (!is_array($rules) || !array_is_list($rules) || count($rules) > 128) {
            return array_merge($errors, ['definition.rules']);
        }
        $visibilityDependencies = [];
        foreach ($rules as $rule) {
            if (!is_array($rule) || !in_array($rule['effect'] ?? '', self::EFFECTS, true)
                || !(($rule['target'] ?? null) === '*' || (self::code($rule['target'] ?? null) && isset($codes[$rule['target']])))
                || !self::validCondition($rule['when'] ?? null, $codes)) {
                $errors[] = 'definition.rules';
                continue;
            }
            if ($rule['effect'] === 'show') {
                $targets = $rule['target'] === '*' ? array_keys($codes) : [$rule['target']];
                foreach ($targets as $target) {
                    $visibilityDependencies[$target] = array_merge($visibilityDependencies[$target] ?? [], self::selfFields($rule['when']));
                }
            }
        }
        $visited = [];
        foreach (array_keys($visibilityDependencies) as $target) {
            if (self::cyclic($target, $visibilityDependencies, $visited)) {
                $errors[] = 'definition.cycle';
                break;
            }
        }
        return array_values(array_unique($errors));
    }

    private static function selfFields(array $condition): array
    {
        $field = $condition['field'] ?? '';
        if ($field !== '') {
            return str_starts_with($field, 'self.') ? [substr($field, 5)] : [];
        }
        $children = isset($condition['not']) ? [$condition['not']] : ($condition['all'] ?? $condition['any']);
        return array_merge(...array_map([self::class, 'selfFields'], $children));
    }

    private static function cyclic(string $code, array $dependencies, array &$visited): bool
    {
        if (isset($visited[$code])) {
            return $visited[$code] === 'visiting';
        }
        $visited[$code] = 'visiting';
        foreach ($dependencies[$code] ?? [] as $parent) {
            if (self::cyclic($parent, $dependencies, $visited)) {
                return true;
            }
        }
        $visited[$code] = 'done';
        return false;
    }

    private static function code(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $value) === 1
            && !in_array($value, ['constructor','prototype','__proto__'], true);
    }

    private static function validCondition(mixed $condition, array $codes, int $depth = 0): bool
    {
        if (!is_array($condition) || $depth > 12) {
            return false;
        }
        foreach (['all','any','not'] as $group) {
            if (array_key_exists($group, $condition)) {
                $items = $group === 'not' ? [$condition[$group]] : $condition[$group];
                if (count($condition) !== 1 || !is_array($items) || !array_is_list($items) || !$items || count($items) > 32) {
                    return false;
                }
                foreach ($items as $item) {
                    if (!self::validCondition($item, $codes, $depth + 1)) {
                        return false;
                    }
                }
                return true;
            }
        }
        $field = $condition['field'] ?? '';
        if (!is_string($field) || !preg_match('/^(self|source)\.([A-Za-z][A-Za-z0-9_-]{0,63})$/D', $field, $parts)
            || ($parts[1] === 'self' && !isset($codes[$parts[2]]))) {
            return false;
        }
        $op = $condition['op'] ?? '';
        return in_array($op, ['eq','gt','gte','lt','lte','selected'], true)
            && ($op === 'selected' || is_scalar($condition['value'] ?? null));
    }

    private static function active(mixed $value): bool
    {
        return $value !== null && $value !== false && $value !== '' && $value !== [];
    }

    private static function matches(array $cond, array $source, array $cells, int $count): bool
    {
        foreach (['all', 'any'] as $mode) {
            if (isset($cond[$mode])) {
                foreach ($cond[$mode] as $child) {
                    if (self::matches($child, $source, $cells, $count) === ($mode === 'any')) {
                        return $mode === 'any';
                    }
                }
                return $mode === 'all';
            }
        }
        if (isset($cond['not'])) {
            return !self::matches($cond['not'], $source, $cells, $count);
        }
        [$scope, $code] = explode('.', $cond['field'], 2);
        $value = $scope === 'self' ? ($cells[$code]['value'] ?? null) : ($source[$code]['value'] ?? null);
        if ($cond['field'] === 'source.count') {
            $value = $count;
        }
        $other = $cond['value'] ?? null;
        if ($cond['op'] === 'selected') {
            return self::active($value);
        }
        if ($cond['op'] === 'eq') {
            return $value === $other || (is_numeric($value) && is_numeric($other) && (float)$value === (float)$other);
        }
        if (!is_numeric($value) || !is_numeric($other)) {
            return false;
        }
        return match ($cond['op']) {
            'gt' => $value > $other, 'gte' => $value >= $other,
            'lt' => $value < $other, 'lte' => $value <= $other, default => false,
        };
    }

    /** Map stable paths to the cells their upstream row exposes. */
    public static function sourceRows(array $source): array
    {
        $rows = [];
        if (!isset($source['rows'])) {
            foreach ($source as $item) {
                if (is_array($item) && self::validPath($item['path'] ?? null)) {
                    $rows[json_encode($item['path'], JSON_THROW_ON_ERROR)] = [];
                }
            }
            return $rows;
        }
        if (!is_array($source['rows'])) {
            return [];
        }
        foreach ($source['rows'] as $row) {
            if (!is_array($row) || !self::validPath($row['path'] ?? null) || !is_array($row['cells'] ?? null)) {
                continue;
            }
            if (($source['definition']['kind'] ?? '') === 'choice') {
                foreach ($row['cells'] as $code => $cell) {
                    if (self::active($cell['value'] ?? null)) {
                        $path = array_merge($row['path'], [(string)$code]);
                        $rows[json_encode($path, JSON_THROW_ON_ERROR)] = $row['cells'];
                    }
                }
            } elseif (array_filter(array_column($row['cells'], 'value'), [self::class, 'active'])) {
                $rows[json_encode($row['path'], JSON_THROW_ON_ERROR)] = $row['cells'];
            }
        }
        return $rows;
    }

    private static function validPath(mixed $path): bool
    {
        if (!is_array($path) || !$path || !array_is_list($path) || count($path) > 32) {
            return false;
        }
        foreach ($path as $code) {
            if (!is_string($code) || $code === '' || strlen($code) > 128) {
                return false;
            }
        }
        return true;
    }

    public static function validateAnswer(array $def, array $answer, array $sources = []): array
    {
        $errors = self::validateDefinition($def);
        if ($errors) {
            return $errors;
        }
        if (($answer['version'] ?? null) !== 1 || !is_array($answer['rows'] ?? null)
            || !array_is_list($answer['rows']) || count($answer['rows']) > 10000) {
            return ['answer.format'];
        }
        if (isset($def['revision']) && ($answer['revision'] ?? null) !== $def['revision']) {
            return ['answer.revision'];
        }
        $sourcesByPath = self::sourceRows($sources[$def['source']] ?? []);
        $options = array_column($def['options'], null, 'code');
        $inputs = [];
        foreach ($answer['rows'] as $row) {
            if (!is_array($row) || !self::validPath($row['path'] ?? null) || !is_array($row['cells'] ?? null)) {
                $errors[] = 'answer.format';
                continue;
            }
            $path = json_encode($row['path'], JSON_THROW_ON_ERROR);
            if (!array_key_exists($path, $sourcesByPath) || array_key_exists($path, $inputs)) {
                $errors[] = 'answer.path';
                continue;
            }
            $inputs[$path] = $row['cells'];
        }
        foreach ($sourcesByPath as $path => $source) {
            $cells = $inputs[$path] ?? [];
            $effects = [];
            $hidden = [];
            foreach ($def['rules'] ?? [] as $rule) {
                $match = self::matches($rule['when'], $source, $cells, count($sourcesByPath));
                if (!$match && $rule['effect'] === 'show') {
                    $hidden[$rule['target']] = true;
                }
                if ($match) {
                    $effects[$rule['effect']][$rule['target']] = true;
                }
            }
            if (isset($hidden['*'])) {
                if ($cells) {
                    $errors[] = 'answer.hidden';
                }
                continue;
            }
            $active = [];
            $single = 0;
            $exclusive = false;
            foreach ($cells as $code => $cell) {
                $opt = $options[$code] ?? null;
                if (!$opt || !is_array($cell) || !array_key_exists('value', $cell) || array_diff(array_keys($cell), ['value','comment'])) {
                    $errors[] = 'answer.format';
                    continue;
                }
                $value = $cell['value'];
                if (!self::validValue($opt['type'], $value) || (isset($cell['comment']) && (!is_string($cell['comment']) || strlen($cell['comment']) > 65535))) {
                    $errors[] = 'answer.type';
                    continue;
                }
                if (!self::active($value)) {
                    if (trim($cell['comment'] ?? '') !== '') {
                        $errors[] = 'answer.comment';
                    }
                    continue;
                }
                if (isset($hidden[$code])) {
                    $errors[] = 'answer.hidden';
                    continue;
                }
                $active[$code] = true;
                $exclusive = $exclusive || !empty($opt['exclusive']);
                $single += (int)($opt['type'] === 'single');
                if ((!empty($opt['comment']) || isset($effects['requireComment'][$code]) || isset($effects['requireComment']['*']))
                    && trim($cell['comment'] ?? '') === '') {
                    $errors[] = 'answer.comment';
                }
            }
            if ($single > 1 || ($exclusive && count($active) > 1)) {
                $errors[] = 'answer.exclusive';
            }
            if (!empty($effects['require']['*']) && !$active) {
                $errors[] = 'answer.required';
            }
            foreach ($options as $code => $opt) {
                if ((isset($effects['require'][$code]) || !empty($opt['required'])) && !isset($hidden[$code]) && !isset($active[$code])) {
                    $errors[] = 'answer.required';
                }
            }
        }
        return array_values(array_unique($errors));
    }

    private static function validValue(string $type, mixed $value): bool
    {
        if ($value === null) {
            return true;
        }
        return match ($type) {
            'number' => (is_float($value) || is_int($value)) && is_finite((float)$value),
            'text' => is_string($value) && strlen($value) <= 65535,
            'single', 'multi' => is_bool($value),
            default => false,
        };
    }

    /** Project saved cells against current sources after a respondent changes a previous page. */
    public static function activeAnswer(array $def, array $answer, array $sources): array
    {
        $filtered = $answer;
        $filtered['rows'] = [];
        if (self::validateDefinition($def)) {
            return $filtered;
        }
        $sourceRows = self::sourceRows($sources[$def['source']] ?? []);
        $options = array_column($def['options'], null, 'code');
        foreach ($answer['rows'] ?? [] as $row) {
            if (!self::validPath($row['path'] ?? null) || !is_array($row['cells'] ?? null)) {
                continue;
            }
            $path = json_encode($row['path'], JSON_THROW_ON_ERROR);
            if (!isset($sourceRows[$path])) {
                continue;
            }
            $cells = array_intersect_key($row['cells'], $options);
            // Removing a hidden answer can hide another option on the same row.
            do {
                $old = count($cells);
                foreach ($def['rules'] ?? [] as $rule) {
                    if ($rule['effect'] === 'show' && $rule['target'] !== '*'
                        && !self::matches($rule['when'], $sourceRows[$path], $cells, count($sourceRows))) {
                        unset($cells[$rule['target']]);
                    }
                }
            } while ($old !== count($cells));
            foreach ($def['rules'] ?? [] as $rule) {
                if ($rule['effect'] === 'show' && $rule['target'] === '*'
                    && !self::matches($rule['when'], $sourceRows[$path], $cells, count($sourceRows))) {
                    continue 2;
                }
            }
            $filtered['rows'][] = ['path' => $row['path'], 'cells' => $cells];
        }
        return $filtered;
    }

    /** Export explicit values, including null, false and zero, without coercion. */
    public static function exportRows(array $def, array $answer): array
    {
        $result = [];
        $options = array_column($def['options'] ?? [], null, 'code');
        foreach ($answer['rows'] ?? [] as $row) {
            foreach ($row['cells'] ?? [] as $code => $cell) {
                $result[] = [
                    'path' => json_encode($row['path'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    'column' => (string)$code, 'type' => $options[$code]['type'] ?? 'legacy',
                    'value' => $cell['value'] ?? null, 'comment' => $cell['comment'] ?? null,
                ];
            }
        }
        return $result;
    }

    /** Read-only projection of historical answers. Hashes identify labels until the author maps them. */
    public static function normalizeLegacy(array $legacy): array
    {
        $output = ['answer' => ['version' => 1, 'rows' => []], 'issues' => [], 'mapping' => []];
        if (!array_filter($legacy, static fn($v) => is_array($v) && (array_key_exists('values', $v) || array_key_exists('comments', $v)))) {
            $grouped = [];
            foreach ($legacy as $label => $value) {
                $parts = explode('_comment_', (string)$label, 2);
                $grouped[$parts[0]] ??= ['values'=>[], 'comments'=>[]];
                if (count($parts) === 2) {
                    $grouped[$parts[0]]['comments'][$parts[1]] = $value;
                } elseif (is_array($value) && array_is_list($value)) {
                    array_push($grouped[$label]['values'], ...$value);
                } elseif (is_scalar($value) && $value !== '') {
                    $grouped[$label]['values'][] = $value;
                } else {
                    $output['issues'][] = 'legacy.mapping';
                }
            }
            foreach ($grouped as &$group) {
                foreach (array_keys($group['comments']) as $label) {
                    if (!in_array($label, $group['values'], true)) {
                        $group['values'][] = $label;
                    }
                }
            }
            unset($group);
            $legacy = $grouped;
        }
        $key = static function (string $label) use (&$output): string {
            $id = 'L' . substr(hash('sha256', $label), 0, 24);
            $output['mapping'][$id] = $label;
            return $id;
        };
        $walk = static function (array $values, array $path, int $depth) use (&$walk, &$output, $key): void {
            if ($depth > 16) {
                $output['issues'][] = 'legacy.depth';
                return;
            }
            $cells = [];
            foreach ($values as $label => $value) {
                $code = $key((string)$label);
                if (is_array($value) && !array_key_exists('comment', $value)) {
                    $walk($value, [...$path, $code], $depth + 1);
                } else {
                    $cells[$code] = is_array($value)
                        ? ['value' => true, 'comment' => $value['comment']]
                        : ['value' => $value];
                }
            }
            if ($cells) {
                $output['answer']['rows'][] = ['path' => $path, 'cells' => $cells];
            }
        };
        foreach ($legacy as $category => $payload) {
            $path = [$key((string)$category)];
            if (!is_array($payload)) {
                $output['issues'][] = 'legacy.mapping';
                $output['answer']['rows'][] = ['path' => $path, 'cells' => ['VALUE' => ['value' => $payload]]];
                continue;
            }
            $values = $payload['values'] ?? $payload;
            if (!is_array($values)) {
                $output['issues'][] = 'legacy.mapping';
                continue;
            }
            if (!array_is_list($values)) {
                $walk($values, $path, 0);
                continue;
            }
            $cells = [];
            foreach ($values as $value) {
                $exclusive = is_array($value) && ($value[0] ?? '') === 'exclude';
                if ($exclusive) {
                    $value = $value[1] ?? null;
                }
                if (!is_scalar($value)) {
                    $output['issues'][] = 'legacy.mapping';
                    continue;
                }
                $label = (string)$value;
                $code = $key($label);
                if (isset($cells[$code])) {
                    $output['issues'][] = 'legacy.mapping';
                }
                $cells[$code] = ['value' => is_numeric($value) && !is_string($value) ? $value : true];
                if (isset($payload['comments'][$label])) {
                    $cells[$code]['comment'] = $payload['comments'][$label];
                }
                if ($exclusive) {
                    $output['issues'][] = 'legacy.exclusive:' . $code;
                }
            }
            if ($cells) {
                $output['answer']['rows'][] = ['path' => $path, 'cells' => $cells];
            }
        }
        $output['issues'] = array_values(array_unique($output['issues']));
        return $output;
    }
}
