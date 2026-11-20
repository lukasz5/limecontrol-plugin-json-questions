<?php
// SPDX-License-Identifier: GPL-2.0-or-later
$h = static function ($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
$m = static function ($key) use ($messages, $h) { return $h($messages[$key]); };
$sid = (int)$ctx->survey->sid;
?>
<!doctype html>
<html lang="<?= $h(App()->language) ?>"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $m('editor') ?></title><link rel="stylesheet" href="<?= $h($assetUrl) ?>/editor.css">
<main><a href="<?= $h(App()->createUrl('surveyAdministration/view',['surveyid'=>$sid])) ?>"><?= $m('back') ?></a>
<h1><?= $m('editor') ?></h1>
<?php foreach ($themes as $kind=>$installed): if (!$installed): ?>
<p role="status"><?= $m('missing') ?> <strong><?= $h(LimeControlJsonContext::THEMES[$kind]) ?></strong></p>
<?php endif; endforeach; ?>
<?php if (!$questions): ?><p><?= $m('empty') ?></p><?php else: ?>
<label><?= $m('question') ?> <select class="select" id="lcjq-question">
<?php foreach ($questions as $name=>$question): ?><option value="<?= $h(self::url('editor',$sid,$name)) ?>" <?= $code === $name ? 'selected' : '' ?>><?= $h($name) ?></option><?php endforeach; ?>
</select></label>
<?php if (App()->request->getQuery('saved') === '1'): ?><p role="status"><?= $m('saved') ?></p><?php endif; ?>
<?php if (!$sources): ?><p><?= $m('empty') ?></p><?php endif; ?>
<form method="post" action="<?= $h(self::url('editor',$sid,$code)) ?>" id="lcjq-editor"
 data-config="<?= $h(json_encode($config, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_INVALID_UTF8_SUBSTITUTE)) ?>">
<input type="hidden" name="<?= $h(App()->request->csrfTokenName) ?>" value="<?= $h(App()->request->csrfToken) ?>">
<input type="hidden" name="expectedRevision" value="<?= $h($config['expectedRevision']) ?>">
<input type="hidden" name="code" value="<?= $h($code) ?>"><input type="hidden" name="definition"><input type="hidden" name="action" value="save">
<label><?= $m('kind') ?><select class="select" id="lcjq-kind"><?php foreach ($themes as $kind=>$installed): ?>
<option value="<?= $h($kind) ?>" <?= $installed ? '' : 'disabled' ?>><?= $m($kind) ?></option><?php endforeach;?></select></label>
<label><?= $m('source') ?><select class="select" id="lcjq-source" required><?php foreach ($sources as $source): ?>
<option><?= $h($source) ?></option><?php endforeach; ?></select></label>
<section><h2><?= $m('options') ?></h2><div id="lcjq-options"></div><button class="btn" id="lcjq-new-option" type="button"><?= $m('add') ?></button></section>
<section><h2><?= $m('rules') ?></h2><div id="lcjq-rules"></div><button class="btn" id="lcjq-new-rule" type="button"><?= $m('add') ?></button></section>
<details><summary><?= $m('preview') ?></summary><div id="lcjq-preview"></div></details>
<p><button type="submit" class="btn btn-primary" <?= !$sources || !array_filter($themes) ? 'disabled' : '' ?>><?= $m('save') ?></button></p>
</form>
<?php if ($active): ?><details><summary><?= $m('detach') ?></summary><p><?= $m('detachHelp') ?></p>
<form method="post" action="<?= $h(self::url('editor',$sid,$code)) ?>">
<input type="hidden" name="<?= $h(App()->request->csrfTokenName) ?>" value="<?= $h(App()->request->csrfToken) ?>">
<input type="hidden" name="code" value="<?= $h($code) ?>"><input type="hidden" name="expectedRevision" value="<?= $h($config['expectedRevision']) ?>">
<button type="submit" class="btn" name="action" value="detach"><?= $m('detach') ?></button></form></details><?php endif;?>
<?php if ($active || $display): ?><p><a href="<?= $h(self::url('backup',$sid,$code)) ?>"><?= $m('backup') ?></a></p><?php endif; ?>
<?php if (!$active && $display): ?><details><summary><?= $m('purge') ?></summary><p><?= $m('purgeHelp') ?></p>
<form method="post" action="<?= $h(self::url('editor',$sid,$code)) ?>"><input type="hidden" name="code" value="<?= $h($code) ?>">
<input type="hidden" name="<?= $h(App()->request->csrfTokenName) ?>" value="<?= $h(App()->request->csrfToken) ?>">
<input type="hidden" name="expectedRevision" value="<?= $h(hash('sha256', $ctx->attribute($questions[$code]['qid'],LimeControlJsonContext::DETACHED))) ?>">
<button class="btn" type="submit" name="action" value="purge"><?= $m('purge') ?></button></form></details><?php endif; ?>
<?php endif; ?>
</main><script defer src="<?= $h($assetUrl) ?>/editor.js"></script></html>
