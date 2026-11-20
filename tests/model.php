<?php
// SPDX-License-Identifier: GPL-2.0-or-later
declare(strict_types=1);
require dirname(__DIR__) . '/LimeControlJsonQuestions/LimeControlJsonModel.php';

function check(bool $actual, string $message): void
{
    if (!$actual) {
        throw new RuntimeException($message);
    }
}

function option(string $code, string $type): array
{
    return ['code' => $code, 'type' => $type, 'label' => ['en' => $code, 'pl' => $code]];
}
$matrix = ['version'=>1, 'kind'=>'matrix', 'source'=>'TASKS', 'options'=>[option('HOURS', 'number')], 'rules'=>[]];
$choice = ['version'=>1, 'kind'=>'choice', 'source'=>'CITIES',
    'options'=>[option('MEASURE','multi'), option('SERVICE','multi'), option('NONE','multi') + ['exclusive'=>true]], 'rules'=>[]];
$followup = ['version'=>1, 'kind'=>'followup', 'source'=>'HOURS_BLOCK',
    'options'=>[option('OTHER','single') + ['comment'=>true], option('OK','single')],
    'rules'=>[['effect'=>'show','target'=>'*','when'=>['all'=>[
        ['field'=>'source.HOURS','op'=>'gt','value'=>8],
        ['not'=>['field'=>'source.HOURS','op'=>'lt','value'=>0]],
    ]]]]];
$cities = ['CITIES'=>[['path'=>['LDZ'],'label'=>'Łódź'], ['path'=>['GDY'],'label'=>'Gdynia']]];
$tasks = ['version'=>1,'rows'=>[
    ['path'=>['LDZ'],'cells'=>['MEASURE'=>['value'=>true]]],
    ['path'=>['GDY'],'cells'=>['SERVICE'=>['value'=>true]]],
]];
check(LimeControlJsonModel::validateAnswer($choice, $tasks, $cities) === [], 'Native source');
$hours = ['version'=>1,'rows'=>[
    ['path'=>['LDZ','MEASURE'],'cells'=>['HOURS'=>['value'=>9]]],
    ['path'=>['GDY','SERVICE'],'cells'=>['HOURS'=>['value'=>0]]],
]];
check(LimeControlJsonModel::validateAnswer($matrix, $hours, ['TASKS'=>$tasks + ['definition'=>$choice]]) === [], 'Matrix');
$sources = ['HOURS_BLOCK'=>$hours + ['definition'=>$matrix]];
$reasons = ['version'=>1,'rows'=>[['path'=>['LDZ','MEASURE'],'cells'=>['OTHER'=>['value'=>true,'comment'=>'Weather']]]]];
check(LimeControlJsonModel::validateAnswer($followup,$reasons,$sources) === [], 'Follow-up');
$invalid = $reasons;
unset($invalid['rows'][0]['cells']['OTHER']['comment']);
check(in_array('answer.comment', LimeControlJsonModel::validateAnswer($followup,$invalid,$sources), true), 'Required comment');
$invalid['rows'][0]['path'] = ['GDY','SERVICE'];
check(in_array('answer.hidden', LimeControlJsonModel::validateAnswer($followup,$invalid,$sources), true), 'Hidden row');
$invalid = $tasks;
$invalid['rows'][0]['cells']['NONE'] = ['value'=>true];
check(in_array('answer.exclusive', LimeControlJsonModel::validateAnswer($choice,$invalid,$cities),true), 'Exclusive option');
$invalid = $hours;
$invalid['rows'][1]['cells']['HOURS']['value'] = '0';
check(in_array('answer.type', LimeControlJsonModel::validateAnswer($matrix,$invalid,['TASKS'=>$tasks+['definition'=>$choice]]),true), 'Numeric typing');
check(LimeControlJsonModel::exportRows($matrix,$hours)[1]['value'] === 0, 'Zero in export');
$old = LimeControlJsonModel::normalizeLegacy(['Serwis'=>['values'=>['Pomiar',['exclude','Brak']], 'comments'=>['Pomiar'=>'tekst']]]);
check(count($old['mapping']) === 3 && count($old['answer']['rows'][0]['cells']) === 2, 'Historical list');
$oldMatrix = LimeControlJsonModel::normalizeLegacy(['Role'=>['values'=>['Row'=>['Hours'=>0,'_active'=>true,'Other'=>['comment'=>'Text']]]]]);
check(in_array(0,array_column($oldMatrix['answer']['rows'][0]['cells'],'value'),true), 'Historical matrix zero');
$native = ['TASKS'=>[]];
$wide = $matrix;
$wide['options'] = [];
$all = ['version'=>1,'rows'=>[]];
for ($r=0; $r<40; $r++) {
    $native['TASKS'][] = ['path'=>['R'.$r], 'label'=>'Row '.$r];
    $row = ['path'=>['R'.$r], 'cells'=>[]];
    for ($c=0; $c<40; $c++) {
        if ($r === 0) {
            $wide['options'][] = option('C'.$c, 'number');
        }
        $row['cells']['C'.$c] = ['value'=>$r * 40 + $c];
    }
    $all['rows'][]=$row;
}
check(LimeControlJsonModel::validateAnswer($wide,$all,$native) === [], '40 x 40 schema');
check(array_column(LimeControlJsonModel::exportRows($wide,$all),'value') === range(0,1599), '40 x 40 CSV order and values');
echo "Model scenarios passed, including 1600 values.\n";
