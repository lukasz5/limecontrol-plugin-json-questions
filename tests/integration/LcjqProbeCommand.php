<?php
// CLI-only helper loaded via YII_CONSOLE_COMMANDS by the disposable test installation.
class LcjqProbeCommand extends CConsoleCommand
{
    public function run($args)
    {
        Yii::import('application.helpers.common_helper', true);
        $task = $args[0];
        if ($task === 'install') {
            $root = getcwd();
            $name = 'LimeControlJsonQuestions';
            $manager = App()->getPluginManager();
            $manifest = ExtensionConfig::loadFromFile("$root/upload/plugins/$name/config.xml");
            $plugin = Plugin::model()->findByAttributes(['name' => $name]);
            if (!$plugin) {
                [$installed, $error] = $manager->installPlugin($manifest, 'upload');
                if (!$installed) throw new RuntimeException($error);
                $plugin = Plugin::model()->findByAttributes(['name' => $name]);
            }
            if (!$manifest->isCompatible()) throw new RuntimeException('Incompatible plugin manifest');
            $obj = $manager->loadPlugin($name, $plugin->id);
            if (!$obj) throw new RuntimeException('Plugin class could not be loaded');
            $event = new LimeSurvey\PluginManager\PluginEvent('beforeActivate', $this);
            $event = $manager->dispatchEvent($event, $name);
            if (!$event->get('success', true)) throw new RuntimeException('Activation hook failed');
            $plugin->active = 1;
            if (!$plugin->save()) throw new RuntimeException('Failed to activate plugin');
            foreach (['LcJsonChoice', 'LcJsonMatrix', 'LcJsonFollowup'] as $name) {
                $path = "$root/upload/themes/question/$name/survey/questions/answer/hugefreetext";
                $config = ExtensionConfig::loadFromFile("$path/config.xml");
                if (!$config->isCompatible()) throw new RuntimeException("Incompatible $name");
                $theme = new QuestionTheme();
                $theme->importManifest($path, false, true);
                if (!QuestionTheme::model()->exists('name=:n AND question_type=:t', [':n'=>$name,':t'=>'U'])) throw new RuntimeException("Unregistered $name");
            }
            SettingGlobal::setSetting('RPCInterface', 'json');
            echo "LCJQ " . json_encode(['edition'=>App()->getConfig('versionnumber'), 'build'=>App()->getConfig('buildnumber'),
                'php'=>PHP_VERSION,'database'=>App()->db->createCommand('SELECT VERSION()')->queryScalar()]) . PHP_EOL;
        } elseif ($task === 'inspect') {
            $sid = filter_var($args[1], FILTER_VALIDATE_INT);
            $survey = Survey::model()->findByPk($sid);
            if (!$survey || $survey->active !== 'Y') throw new RuntimeException('Active test survey expected');
            $model = SurveyDynamic::model($sid);
            echo "LCJQ " . json_encode(['columns'=>array_keys($model->getTableSchema()->columns), 'responses'=>$model->count()]) . PHP_EOL;
        } else {
            throw new InvalidArgumentException('Unknown test probe');
        }
    }
}
