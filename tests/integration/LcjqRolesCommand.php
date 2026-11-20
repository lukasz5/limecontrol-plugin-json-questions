<?php
// SPDX-License-Identifier: GPL-2.0-or-later
/** Local fixture for verifying the plugin with real authenticated LimeSurvey accounts. */
class LcjqRolesCommand extends CConsoleCommand
{
    public function run($args)
    {
        Yii::import('application.helpers.common_helper', true);
        $sid = (int)($args[0] ?? 0);
        $suffix = getenv('LCJQ_ROLE_RUN');
        $password = getenv('LCJQ_ROLE_PASSWORD');
        if (!preg_match('/^lcq[a-zA-Z0-9_]*_$/D', App()->db->tablePrefix) ||
            !preg_match('/^[a-f0-9]{10}$/D', (string)$suffix) || strlen((string)$password) < 24 ||
            !Survey::model()->exists('sid=:sid AND active=:active', [':sid'=>$sid, ':active'=>'Y'])) {
            throw new RuntimeException('Disposable synthetic installation, active survey and test credentials required');
        }
        $roles = ['author'=>['surveycontent',['update']], 'analyst'=>['responses',['read','export']],
            'reader'=>['responses',['read']], 'exporter'=>['responses',['export']]];
        foreach ($roles as $role=>[$permissionName,$rights]) {
            $login = 'lcq_' . $role . '_' . $suffix;
            $uid = User::insertUser($login, $password, 'Synthetic ' . $role, 1, $login . '@example.invalid');
            if (!$uid) {
                throw new RuntimeException('Could not provision isolated account');
            }
            foreach ([['global',0,'auth_db',['read']],['survey',$sid,$permissionName,$rights]] as [$entity,$entityId,$name,$permissions]) {
                $p = new Permission();
                $p->uid=$uid; $p->entity=$entity; $p->entity_id=$entityId; $p->permission=$name;
                foreach (['create','read','update','delete','import','export'] as $right) {
                    $p->{$right . '_p'}=(int)in_array($right,$permissions,true);
                }
                if (!$p->save()) { throw new RuntimeException('Could not provision isolated permissions'); }
            }
        }
        echo 'LCJQ {"accounts":4}' . PHP_EOL;
    }
}
