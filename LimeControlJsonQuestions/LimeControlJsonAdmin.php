<?php
// SPDX-License-Identifier: GPL-2.0-or-later

final class LimeControlJsonAdmin
{
    private const TEXT = [
        'editor'=>['LimeControl JSON · Edytor', 'LimeControl JSON · Editor', 'LimeControl JSON · Editor'],
        'export'=>['LimeControl JSON · Eksport CSV', 'LimeControl JSON · Export CSV', 'LimeControl JSON · CSV-Export'],
        'dictionary'=>['LimeControl JSON · Słownik CSV', 'LimeControl JSON · Codebook CSV', 'LimeControl JSON · Codebuch CSV'],
        'invalid'=>['Sprawdź definicję i odpowiedź.', 'Check the definition and answer.', 'Definition und Antwort prüfen.'],
        'fix'=>['Popraw konfigurację pytań w edytorze LimeControl JSON.', 'Correct these questions in the LimeControl JSON editor.', 'Diese Fragen im LimeControl-JSON-Editor korrigieren.'],
        'size'=>['Odpowiedź przekroczyła pojemność pola. Podziel blok na mniejsze pytania.', 'This answer exceeds the field capacity. Split the block into smaller questions.', 'Die Antwort überschreitet die Feldgröße. Teilen Sie den Block in kleinere Fragen.'],
        'definition.version'=>['Sprawdź wersję i typ bloku.', 'Check the block version and type.', 'Version und Art des Blocks prüfen.'],
        'definition.source'=>['Wybierz obsługiwane wcześniejsze pytanie.', 'Select a supported earlier question.', 'Eine unterstützte frühere Frage auswählen.'],
        'definition.sourceField'=>['Wskaż istniejącą kolumnę źródła w warunku.', 'Select an existing source column in the condition.', 'Eine vorhandene Quellspalte in der Bedingung auswählen.'],
        'definition.options'=>['Zdefiniuj od 1 do 256 opcji.', 'Define between 1 and 256 options.', 'Zwischen 1 und 256 Optionen festlegen.'],
        'definition.option'=>['Sprawdź unikatowe kody, typy i właściwości opcji.', 'Check option codes, types and flags. Codes must be unique.', 'Eindeutige Codes, Typen und Eigenschaften der Optionen prüfen.'],
        'definition.label'=>['Dodaj etykietę opcji w co najmniej jednym języku (do 2048 bajtów).', 'Add an option label in at least one language (up to 2048 bytes).', 'Eine Optionsbezeichnung in mindestens einer Sprache hinzufügen (bis zu 2048 Byte).'],
        'definition.rules'=>['Sprawdź pola, operatory i cele reguł.', 'Check rule fields, operators and targets.', 'Felder, Operatoren und Ziele der Regeln prüfen.'],
        'definition.cycle'=>['Usuń zależność cykliczną z reguł widoczności.', 'Remove the circular dependency in visibility rules.', 'Die zyklische Abhängigkeit in den Sichtbarkeitsregeln entfernen.'],
        'answer.format'=>['Format odpowiedzi jest nieprawidłowy.', 'The answer format is invalid.', 'Das Antwortformat ist ungültig.'],
        'answer.revision'=>['Odśwież pytanie, aby użyć właściwej wersji.', 'Reload the question to use the correct revision.', 'Frage neu laden, um die passende Version zu verwenden.'],
        'answer.path'=>['Wiersze muszą odpowiadać wyborom w pytaniu źródłowym.', 'Rows must match the selections in the source question.', 'Zeilen müssen der Auswahl in der Quellfrage entsprechen.'],
        'answer.type'=>['Sprawdź typ wprowadzonej wartości.', 'Check the type of the entered value.', 'Typ des eingegebenen Werts prüfen.'],
        'answer.hidden'=>['Sprawdź odpowiedzi ukryte przez regułę.', 'Check values hidden by a rule.', 'Durch eine Regel ausgeblendete Werte prüfen.'],
        'answer.required'=>['Uzupełnij wymagane pola.', 'Complete the required fields.', 'Pflichtfelder ausfüllen.'],
        'answer.comment'=>['Sprawdź komentarz przy wybranej opcji.', 'Check the comment for the selected option.', 'Kommentar zur ausgewählten Option prüfen.'],
        'answer.exclusive'=>['Wybierz pojedynczą wartość dla opcji wyłącznej.', 'Choose one value for an exclusive option.', 'Bei einer exklusiven Option nur einen Wert auswählen.'],
        'detach'=>['Odłącz motyw i walidację', 'Detach theme and validation', 'Design und Validierung trennen'],
        'detachHelp'=>['Zapisane odpowiedzi i definicje pozostaną dostępne. Pytanie stanie się zwykłym polem tekstowym. Zapisanie konfiguracji w edytorze podłącza je ponownie.', 'Saved answers and definitions remain available. The question becomes a plain text field. Save the configuration in the editor to reconnect it.', 'Gespeicherte Antworten und Definitionen bleiben erhalten. Die Frage wird zum Textfeld. Speichern Sie die Konfiguration im Editor, um sie erneut zu verbinden.'],
        'purge'=>['Usuń zachowaną konfigurację', 'Delete retained configuration', 'Gespeicherte Konfiguration löschen'],
        'purgeHelp'=>['Po pobraniu kopii definicji usuń metadane tego odłączonego pytania. Odpowiedzi pozostaną w tabeli ankiety. Historia definicji i słownik tego pytania zostaną usunięte.', 'After downloading a definition backup, remove metadata for this detached question. The response table is retained. Definition history and the codebook for this question will be deleted.', 'Nach dem Herunterladen der Definition die Metadaten dieser getrennten Frage entfernen. Antworten bleiben erhalten. Definitionshistorie und Codebuch dieser Frage werden gelöscht.'],
        'backup'=>['Pobierz definicje i historię', 'Download definitions and history', 'Definitionen und Historie herunterladen'],
        'dependent'=>['Najpierw odłącz zależne pytanie', 'Detach the dependent question first', 'Zuerst die abhängige Frage trennen'],
        'detachFirst'=>['Najpierw odłącz pytania w edytorze LimeControl JSON, aby usunąć wywołania funkcji z równań ankiet.', 'Detach the questions in the LimeControl JSON editor first to remove plugin calls from survey equations.', 'Trennen Sie zuerst die Fragen im LimeControl-JSON-Editor, um Plugin-Aufrufe aus den Umfragegleichungen zu entfernen.'],
        'manualEquation'=>['Zmieniono równanie. Usuń jego wywołanie lcjqValid w opcjach logiki pytania i ponów odłączanie.', 'The equation has changed. Remove its lcjqValid call in question logic and retry detaching.', 'Die Gleichung wurde geändert. Entfernen Sie den lcjqValid-Aufruf in der Fragenlogik und trennen Sie die Frage erneut.'],
        'legacy'=>['LimeControl JSON · Raport starych formatów', 'LimeControl JSON · Legacy report', 'LimeControl JSON · Bericht zu Altformaten'],
        'source'=>['Wcześniejsze pytanie źródłowe', 'Earlier source question', 'Vorherige Quellfrage'],
        'question'=>['Pytanie typu U', 'Huge free-text question (U)', 'Ausführlicher Freitext (U)'],
        'missing'=>['Brakuje motywu. Zainstaluj odpowiedni ZIP.', 'Theme missing. Install its ZIP.', 'Design fehlt. Bitte das ZIP installieren.'],
        'empty'=>['Dodaj pytanie typu U i wcześniejsze pytanie wyboru w ankiecie.', 'Add a huge free-text question and an earlier choice question.', 'Eine ausführliche Freitextfrage und eine frühere Auswahlfrage anlegen.'],
        'kind'=>['Motyw pytania', 'Question theme', 'Fragendesign'],
        'choice'=>['Wybór dla każdej pozycji', 'Choice for each item', 'Auswahl je Eintrag'],
        'matrix'=>['Tabela z wcześniejszych odpowiedzi', 'Table from previous answers', 'Tabelle aus früheren Antworten'],
        'followup'=>['Pytanie uzupełniające', 'Follow-up question', 'Anschlussfrage'],
        'options'=>['Opcje i kolumny', 'Options and columns', 'Optionen und Spalten'],
        'add'=>['Dodaj', 'Add', 'Hinzufügen'], 'remove'=>['Usuń', 'Remove', 'Entfernen'],
        'code'=>['Stały kod', 'Stable code', 'Fester Code'], 'type'=>['Typ', 'Type', 'Typ'],
        'label'=>['Etykieta', 'Label', 'Bezeichnung'], 'single'=>['Wybór pojedynczy', 'Single choice', 'Einfachauswahl'],
        'multi'=>['Wielokrotny wybór', 'Multiple choice', 'Mehrfachauswahl'], 'number'=>['Liczba', 'Number', 'Zahl'],
        'text'=>['Tekst', 'Text', 'Text'], 'exclusive'=>['Wyłączna', 'Exclusive', 'Exklusiv'],
        'comment'=>['Komentarz', 'Comment', 'Kommentar'], 'rules'=>['Reguły', 'Rules', 'Regeln'],
        'target'=>['Zastosuj do', 'Apply to', 'Anwenden auf'], 'effect'=>['Działanie', 'Action', 'Aktion'],
        'show'=>['Pokaż', 'Show', 'Anzeigen'], 'require'=>['Wymagaj wartości', 'Require a value', 'Wert verlangen'],
        'requireComment'=>['Wymagaj komentarza', 'Require a comment', 'Kommentar verlangen'], 'all'=>['Wszystkie', 'All', 'Alle'],
        'any'=>['Dowolny', 'Any', 'Mindestens eine'], 'not'=>['Zaprzeczenie', 'Not', 'Nicht'], 'leaf'=>['Porównanie', 'Comparison', 'Vergleich'],
        'field'=>['Pole', 'Field', 'Feld'], 'op'=>['Operator', 'Operator', 'Operator'], 'value'=>['Wartość', 'Value', 'Wert'],
        'eq'=>['Równa się', 'Equals', 'Gleich'], 'gt'=>['Większe niż', 'Greater than', 'Größer als'],
        'gte'=>['Co najmniej', 'At least', 'Mindestens'], 'lt'=>['Mniejsze niż', 'Less than', 'Kleiner als'],
        'lte'=>['Co najwyżej', 'At most', 'Höchstens'], 'selected'=>['Zaznaczone', 'Selected', 'Ausgewählt'],
        'count'=>['Liczba wskazań ze źródła', 'Source selection count', 'Anzahl der Quellauswahlen'],
        'save'=>['Zapisz', 'Save', 'Speichern'], 'saved'=>['Zapisano.', 'Saved.', 'Gespeichert.'],
        'stale'=>['Definicja zmieniła się. Odśwież stronę.', 'The definition changed. Reload the editor.', 'Die Definition wurde geändert. Editor neu laden.'],
        'back'=>['Powrót do ankiety', 'Back to survey', 'Zurück zur Umfrage'],
        'preview'=>['Podgląd z przykładową pozycją', 'Preview with a sample item', 'Vorschau mit Beispiel'],
        'sample'=>['Pozycja przykładowa', 'Sample item', 'Beispieleintrag'],
    ];

    public static function message($key)
    {
        $index = ['pl'=>0, 'en'=>1, 'de'=>2][substr(App()->language, 0, 2)] ?? 1;
        return self::TEXT[$key][$index] ?? $key;
    }

    public static function errors(array $codes)
    {
        return implode(' ', array_map(static function ($code) { return self::message($code) . ' (' . $code . ')'; }, array_unique($codes)));
    }

    public static function url($action, $sid, $code = null)
    {
        $args = ['plugin'=>'LimeControlJsonQuestions','function'=>$action,'sid'=>(int)$sid];
        if ($code !== null) {
            $args['code'] = $code;
        }
        return App()->createUrl('plugins/direct', $args);
    }

    public static function themeExists($name)
    {
        return isset(array_flip(LimeControlJsonContext::THEMES)[$name])
            && QuestionTheme::model()->exists('name=:name AND question_type=:type', [':name'=>$name, ':type'=>'U']);
    }

    public static function dispatch($action)
    {
        $request = App()->request;
        $sid = (int)$request->getQuery('sid', 0);
        if (!in_array($action, ['editor','export','dictionary','legacy','backup'], true) || !$sid) {
            throw new CHttpException(404);
        }
        $editing = in_array($action,['editor','backup'],true);
        if (App()->user->isGuest || (!$editing && !Permission::model()->hasSurveyPermission($sid,'responses','read'))
            || !Permission::model()->hasSurveyPermission($sid,
            $editing ? 'surveycontent' : 'responses', $editing ? 'update' : 'export')) {
            throw new CHttpException(403);
        }
        $ctx = LimeControlJsonContext::get($sid);
        if (!$editing) {
            if (!$request->isPostRequest && $request->requestType === 'GET') {
                self::csv($ctx, $action);
                return;
            }
            throw new CHttpException(405);
        }
        $code = $request->getQuery('code', '');
        if (!is_string($code) || $code !== '' && !isset($ctx->questions[$code])) {
            throw new CHttpException(404);
        }
        if ($action === 'backup') {
            if ($request->requestType !== 'GET' || !isset($ctx->questions[$code])) { throw new CHttpException(400); }
            $qid = $ctx->questions[$code]['qid'];
            $snapshot = ['version'=>1,'questionCode'=>$code,'current'=>$ctx->definition($code),
                'detached'=>json_decode($ctx->attribute($qid,LimeControlJsonContext::DETACHED),true),
                'history'=>json_decode($ctx->attribute($qid,LimeControlJsonContext::HISTORY),true) ?: []];
            header('Content-Type: application/json; charset=UTF-8');
            header('Content-Disposition: attachment; filename="limecontrol-question-' . (int)$qid . '.json"');
            header('Cache-Control: private, no-store');
            echo self::json($snapshot); App()->end(); return;
        }
        if ($request->isPostRequest) {
            if (!is_string($request->getPost($request->csrfTokenName)) || !hash_equals($request->csrfToken, $request->getPost($request->csrfTokenName))) {
                throw new CHttpException(403);
            }
            if ($request->getPost('code') !== $code || !isset($ctx->questions[$code]) || $ctx->questions[$code]['type'] !== 'U') {
                throw new CHttpException(400);
            }
            $expected = $request->getPost('expectedRevision', '');
            if ($request->getPost('action') === 'purge') {
                self::purge($ctx, $code, $expected);
                App()->getController()->redirect(self::url('editor',$sid,$code));
                return;
            }
            if ($request->getPost('action') === 'detach') {
                self::detach($sid, $code, $expected);
                App()->getController()->redirect(self::url('editor', $sid, $code));
                return;
            }
            $raw = $request->getPost('definition', '');
            $def = is_string($raw) && strlen($raw) <= 1048576 ? json_decode($raw, true, 32) : null;
            if (!is_array($def) || !is_string($expected)) {
                throw new CHttpException(422, self::message('invalid'));
            }
            self::save($sid, $code, $def, $expected);
            App()->getController()->redirect(self::url('editor', $sid, $code) . (strpos(self::url('editor',$sid,$code),'?') === false ? '?' : '&') . 'saved=1');
        }
        self::editor($ctx, $code);
    }

    private static function save($sid, $code, array $def, $expected)
    {
        $db = App()->db;
        $tx = $db->beginTransaction();
        try {
            // Serialize editors on the parent question, including its first configuration.
            $lock = in_array($db->driverName, ['mysql','pgsql'], true) ? ' FOR UPDATE' : '';
            $sql = 'SELECT qid FROM {{questions}} WHERE sid=:sid AND title=:code AND parent_qid=0' . $lock;
            $qid = $db->createCommand($sql)->queryScalar([':sid'=>$sid, ':code'=>$code]);
            LimeControlJsonContext::clear();
            $ctx = LimeControlJsonContext::get($sid);
            if (!$qid || ($ctx->questions[$code]['type'] ?? null) !== 'U') {
                throw new CHttpException(404);
            }
            $old = $ctx->definition($code);
            if (($old['revision'] ?? '') !== $expected) {
                throw new CHttpException(409, self::message('stale'));
            }
            unset($def['revision']);
            $errors = $ctx->definitionErrors($code, $def);
            if ($errors) {
                throw new CHttpException(422, self::errors($errors));
            }
            $theme = LimeControlJsonContext::THEMES[$def['kind']];
            if (!self::themeExists($theme)) {
                throw new CHttpException(422, self::message('missing') . ' ' . $theme);
            }
            $detached = json_decode($ctx->attribute($qid, LimeControlJsonContext::DETACHED), true) ?: [];
            if (!$old && $detached) {
                $old = $detached;
                $db->createCommand()->delete('{{question_attributes}}','qid=:q AND attribute=:a',[':q'=>$qid,':a'=>LimeControlJsonContext::DETACHED]);
            }
            $def['revision'] = substr(hash('sha256', self::json($def)), 0, 16);
            $history = json_decode($ctx->attribute($qid, LimeControlJsonContext::HISTORY), true) ?: [];
            if ($old) {
                $history[$old['revision'] ?? '_initial'] = $old;
            }
            $eq = LimeControlJsonContext::equation($code);
            $existing = trim($ctx->attribute($qid, 'em_validation_q'));
            $attrs = [LimeControlJsonContext::DEF=>self::json($def), LimeControlJsonContext::HISTORY=>self::json($history)];
            if (strpos($existing, $eq) === false) {
                $attrs['em_validation_q'] = $existing === '' ? $eq : '(' . $existing . ') and ' . $eq;
            }
            foreach ($attrs as $key => $value) {
                $attr = QuestionAttribute::model()->findByAttributes(['qid'=>$qid,'attribute'=>$key]) ?: new QuestionAttribute();
                $attr->qid = $qid;
                $attr->attribute = $key;
                $attr->value = $value;
                if (!$attr->save() || $attr->value !== $value) {
                    throw new CHttpException(422, self::message('invalid') . ' ' . $key);
                }
            }
            $db->createCommand()->update('{{questions}}', ['question_theme_name'=>$theme], 'qid=:qid AND sid=:sid', [':qid'=>$qid, ':sid'=>$sid]);
            $tx->commit();
            LimeControlJsonContext::clear();
            LimeExpressionManager::SetDirtyFlag();
            EmCacheHelper::init(['sid'=>$sid, 'active'=>$ctx->survey->active]);
            EmCacheHelper::flush();
        } catch (Throwable $error) {
            if ($tx->active) {
                $tx->rollback();
            }
            throw $error;
        }
    }

    private static function detach($sid, $code, $expected)
    {
        $db = App()->db;
        $tx = $db->beginTransaction();
        try {
            $lock = in_array($db->driverName, ['mysql','pgsql'], true) ? ' FOR UPDATE' : '';
            $qid = $db->createCommand('SELECT qid FROM {{questions}} WHERE sid=:sid AND title=:code AND parent_qid=0' . $lock)
                ->queryScalar([':sid'=>$sid, ':code'=>$code]);
            LimeControlJsonContext::clear();
            $ctx = LimeControlJsonContext::get($sid);
            $old = $ctx->definition($code);
            if (!$old || ($old['revision'] ?? '') !== $expected) {
                throw new CHttpException(409, self::message('stale'));
            }
            foreach (array_keys($ctx->questions) as $other) {
                if (($ctx->definition($other)['source'] ?? null) === $code) {
                    throw new CHttpException(409, self::message('dependent') . ' ' . $other);
                }
            }
            $managed = LimeControlJsonContext::equation($code);
            $equation = trim($ctx->attribute($qid, 'em_validation_q'));
            if ($equation === $managed) {
                $equation = '';
            } elseif (substr($equation, -strlen(') and ' . $managed)) === ') and ' . $managed && substr($equation, 0, 1) === '(') {
                $equation = substr($equation, 1, -strlen(') and ' . $managed));
            } elseif (stripos($equation,'lcjqValid(') !== false) {
                throw new CHttpException(409, self::message('manualEquation'));
            }
            $db->createCommand()->delete('{{question_attributes}}','qid=:q AND attribute=:a',[':q'=>$qid, ':a'=>LimeControlJsonContext::DETACHED]);
            $db->createCommand()->update('{{question_attributes}}',['attribute'=>LimeControlJsonContext::DETACHED],
                'qid=:q AND attribute=:a',[':q'=>$qid, ':a'=>LimeControlJsonContext::DEF]);
            $equationParams = [':q'=>$qid, ':a'=>'em_validation_q'];
            if ($equation === '') {
                $db->createCommand()->delete('{{question_attributes}}', 'qid=:q AND attribute=:a', $equationParams);
            } else {
                $db->createCommand()->update('{{question_attributes}}',['value'=>$equation], 'qid=:q AND attribute=:a', $equationParams);
            }
            $db->createCommand()->update('{{questions}}',['question_theme_name'=>'core'],'qid=:q AND sid=:s',[':q'=>$qid,':s'=>$sid]);
            $tx->commit();
            LimeControlJsonContext::clear();
            LimeExpressionManager::SetDirtyFlag();
            EmCacheHelper::init(['sid'=>$sid, 'active'=>$ctx->survey->active]); EmCacheHelper::flush();
        } catch (Throwable $error) {
            if ($tx->active) { $tx->rollback(); }
            throw $error;
        }
    }

    private static function purge($ctx, $code, $expected)
    {
        $qid = (int)$ctx->questions[$code]['qid'];
        $sid = (int)$ctx->survey->sid;
        $db = App()->db;
        $tx = $db->beginTransaction();
        try {
            $lock = in_array($db->driverName, ['mysql','pgsql'],true) ? ' FOR UPDATE' : '';
            $db->createCommand('SELECT qid FROM {{questions}} WHERE qid=:q AND sid=:s' . $lock)->queryScalar([':q'=>$qid,':s'=>$sid]);
            LimeControlJsonContext::clear();
            $ctx = LimeControlJsonContext::get($sid);
            $retained = $ctx->attribute($qid,LimeControlJsonContext::DETACHED);
            if ($ctx->definition($code) || !$retained || !is_string($expected) || !hash_equals(hash('sha256',$retained),$expected)) {
                throw new CHttpException(409, self::message('stale'));
            }
            $db->createCommand()->delete('{{question_attributes}}', ['and','qid=:qid',
                ['in','attribute',[LimeControlJsonContext::DETACHED,LimeControlJsonContext::HISTORY]]], [':qid'=>$qid]);
            $tx->commit();
        } catch (Throwable $e) {
            if ($tx->active) { $tx->rollback(); }
            throw $e;
        }
    }

    private static function json($value)
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    }

    private static function editor($ctx, $code)
    {
        $questions = array_filter($ctx->questions, static function ($q) { return $q['type'] === 'U'; });
        if (!isset($questions[$code])) {
            $code = $questions ? (string)array_key_first($questions) : '';
        }
        $messages = [];
        foreach (array_keys(self::TEXT) as $key) {
            $messages[$key] = self::message($key);
        }
        $sources = $ctx->eligibleSources($code);
        $sourceDefinitions = [];
        foreach ($sources as $source) {
            $sourceDefinitions[$source] = $ctx->definition($source);
        }
        $active = $ctx->definition($code);
        $display = $active ?: (isset($questions[$code]) ? json_decode($ctx->attribute($questions[$code]['qid'], LimeControlJsonContext::DETACHED), true) : null);
        $config = ['expectedRevision'=>$active['revision'] ?? '', 'definition'=>$display ?: [], 'sourceDefinitions'=>$sourceDefinitions, 'sources'=>$sources,
            'questionCode'=>$code, 'messages'=>$messages, 'language'=>App()->language];
        $assetUrl = App()->assetManager->publish(__DIR__ . '/assets');
        $themes = [];
        foreach (LimeControlJsonContext::THEMES as $kind=>$name) {
            $themes[$kind] = self::themeExists($name);
        }
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: private, no-store');
        require __DIR__ . '/editor.php';
        App()->end();
    }

    private static function csv($ctx, $action)
    {
        $sid = (int)$ctx->survey->sid;
        $dictionary = $action === 'dictionary';
        $legacy = $action === 'legacy';
        if (!$dictionary && $ctx->survey->active !== 'Y') {
            throw new CHttpException(409, 'Survey inactive');
        }
        $blocks = [];
        foreach ($ctx->questions as $code => $q) {
            if ($q['type'] === 'U' && ($ctx->definition($code) || $ctx->attribute($q['qid'], LimeControlJsonContext::DETACHED) || $legacy && in_array(strtolower($q['question_theme_name'] ?? ''), ['jsonmultiplechoice','multiplechoicefromjson','tablefromjson'], true))) {
                $blocks[$code] = $ctx->fieldName($code);
            }
        }
        $suffix = $dictionary ? 'codebook' : ($legacy ? 'legacy' : 'responses');
        $file = fopen('php://temp/maxmemory:2097152', 'w+b');
        if ($dictionary) {
            self::row($file, ['question_code','revision','column','type','exclusive','comment','pl','en','de']);
            foreach ($blocks as $code => $name) {
                $def = $ctx->definition($code) ?: json_decode($ctx->attribute($ctx->questions[$code]['qid'], LimeControlJsonContext::DETACHED), true);
                $history = json_decode($ctx->attribute($ctx->questions[$code]['qid'], LimeControlJsonContext::HISTORY), true) ?: [];
                $history[$def['revision'] ?? ''] = $def;
                foreach ($history as $rev => $definition) {
                    foreach ($definition['options'] as $opt) {
                        self::row($file, [$code,$rev,$opt['code'],$opt['type'],(int)($opt['exclusive'] ?? false),
                            (int)($opt['comment'] ?? false),$opt['label']['pl'] ?? '',$opt['label']['en'] ?? '',$opt['label']['de'] ?? '']);
                    }
                }
            }
        } else {
            self::row($file, $legacy ? ['response_id','question_code','mapping_code','label','review']
                : ['response_id','question_code','revision','path','column','type','value','comment']);
            $last = 0;
            while ($blocks) {
                $criteria = new CDbCriteria();
                $criteria->addCondition('id > :after');
                $criteria->params[':after'] = $last;
                $criteria->order = 'id';
                $criteria->limit = 100;
                // Include native upstream answers for relevance; only allowlisted JSON columns are emitted.
                $responses = Response::model($sid)->findAll($criteria);
                foreach ($responses as $response) {
                    $last = (int)$response->getPrimaryKey();
                    $response->decrypt();
                    foreach ($blocks as $code => $field) {
                        $raw = $response->getAttribute($field);
                        if ($raw === null || $raw === '') {
                            continue;
                        }
                        $answer = json_decode((string)$raw, true);
                        if (!is_array($answer)) {
                            throw new CHttpException(422, self::message('invalid') . ' ' . $code);
                        }
                        if ($legacy) {
                            if (($answer['version'] ?? null) !== 1) {
                                $normalized = LimeControlJsonModel::normalizeLegacy($answer);
                                foreach ($normalized['mapping'] as $mapped => $label) {
                                    self::row($file, [$last,$code,$mapped,$label,implode('|', array_merge(['legacy.mapping'], $normalized['issues']))]);
                                }
                                if (!$normalized['mapping']) {
                                    self::row($file, [$last,$code,'','',implode('|', $normalized['issues'])]);
                                }
                            }
                            continue;
                        }
                        $rev = $answer['revision'] ?? '';
                        $definition = $ctx->responseDefinition($code, $answer);
                        if (!$definition || ($answer['version'] ?? null) !== 1) {
                            throw new CHttpException(422, self::message('invalid') . ' ' . $code);
                        }
                        $sources = $ctx->sourceContext($definition, $response->attributes);
                        $answer = LimeControlJsonModel::activeAnswer($definition, $answer, $sources['sources']);
                        foreach (LimeControlJsonModel::exportRows($definition, $answer) as $row) {
                            self::row($file, [$last,$code,$rev,$row['path'],$row['column'],$row['type'],$row['value'],$row['comment']]);
                        }
                    }
                }
                if (count($responses) < 100) {
                    break;
                }
            }
        }
        rewind($file);
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="limecontrol-json-' . $sid . '-' . $suffix . '.csv"');
        header('Cache-Control: private, no-store');
        fpassthru($file); fclose($file);
        App()->end();
    }

    private static function row($file, array $cells)
    {
        foreach ($cells as &$cell) {
            if (is_bool($cell) || is_array($cell)) {
                $cell = self::json($cell);
            } elseif (is_string($cell) && preg_match('/^[\x00-\x20]*[=+@-]/u', $cell)) {
                $cell = "'" . $cell;
            }
        }
        unset($cell);
        fputcsv($file, $cells, ',', '"', '');
    }
}
