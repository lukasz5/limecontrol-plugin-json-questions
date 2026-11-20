<?php
// SPDX-License-Identifier: GPL-2.0-or-later
// CLI-only helper loaded via YII_CONSOLE_COMMANDS by the disposable test installation.
class LcjqProbeCommand extends CConsoleCommand
{
    public function run($args)
    {
        Yii::import('application.helpers.common_helper', true);
        $task = $args[0];
        if ($task === 'installed') {
            $name = 'LimeControlJsonQuestions';
            $plugin = Plugin::model()->findByAttributes(['name' => $name]);
            if (!$plugin || (int)$plugin->active !== 1 || !App()->getPluginManager()->loadPlugin($name, $plugin->id)) {
                throw new RuntimeException('Plugin not active after native ZIP installation');
            }
            foreach (['LcJsonChoice','LcJsonMatrix','LcJsonFollowup'] as $theme) {
                if (!QuestionTheme::model()->exists('name=:n AND question_type=:t', [':n'=>$theme,':t'=>'U'])) {
                    throw new RuntimeException("Theme missing after native ZIP installation: $theme");
                }
            }
            SettingGlobal::setSetting('RPCInterface', 'json');
            echo "LCJQ " . json_encode(['edition'=>App()->getConfig('versionnumber'), 'build'=>App()->getConfig('buildnumber'),
                'php'=>PHP_VERSION,'database'=>App()->db->createCommand('SELECT VERSION()')->queryScalar()]) . PHP_EOL;
        } elseif ($task === 'plugin-state') {
            $plugin = Plugin::model()->findByAttributes(['name' => 'LimeControlJsonQuestions']);
            echo 'LCJQ ' . json_encode(['enabled' => (int)$plugin->active === 1]) . PHP_EOL;
        } elseif ($task === 'inspect') {
            $sid = filter_var($args[1], FILTER_VALIDATE_INT);
            $survey = Survey::model()->findByPk($sid);
            if (!$survey || $survey->active !== 'Y') throw new RuntimeException('Active test survey expected');
            $model = SurveyDynamic::model($sid);
            $hash = hash_init('sha256');
            foreach ($model->findAll(['order'=>'id ASC']) as $record) {
                hash_update($hash, json_encode($record->attributes, JSON_THROW_ON_ERROR));
            }
            echo "LCJQ " . json_encode(['columns'=>array_keys($model->getTableSchema()->columns),
                'responses'=>$model->count(), 'response_digest'=>hash_final($hash)]) . PHP_EOL;
        } else {
            throw new InvalidArgumentException('Unknown test probe');
        }
    }
}
