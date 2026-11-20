<?php
// Only copied into a newly extracted LimeSurvey tree by the test runner.
return [
    'components' => [
        'db' => [
            'connectionString' => getenv('LCJQ_DSN'),
            'emulatePrepare' => true,
            'username' => getenv('LCJQ_DB_USER'),
            'password' => 'lcjq-synthetic-test',
            'charset' => getenv('LCJQ_DB_USER') === 'postgres' ? 'utf8' : 'utf8mb4',
            'tablePrefix' => getenv('LCJQ_TABLE_PREFIX'),
        ],
        'session' => [
            'sessionName' => 'LS-LCQ-TEST',
            'class' => 'application.core.web.DbHttpSession',
            'connectionID' => 'db',
            'sessionTableName' => '{{sessions}}',
        ],
        'urlManager' => ['urlFormat' => 'path', 'rules' => [], 'showScriptName' => true],
    ],
    'config' => ['debug' => 0, 'debugsql' => 0, 'RPCInterface' => 'json'],
];
