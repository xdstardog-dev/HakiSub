<script setup>
const { questions, recovery } = defineProps({ questions: Array, recovery: Boolean })
function exportAnswers() {
  const content = questions.map((entry, index) => (index + 1) + '. ' + entry.question + '\n安全码（密保答案）：' + entry.answer).join('\n\n')
  const url = URL.createObjectURL(new Blob(['XDstar 账号安全码\n请妥善保管此文件。\n\n' + content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = 'xdstar-security-codes.txt'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const suggestions = ['你为自己记住的第一段私密短语是什么？', '你珍藏而不公开的一段记忆代号是什么？', '你给想象中的地方起的秘密名字是什么？', '你为遥远星球取的秘密名字是什么？', '你私下记住的一件物品代号是什么？']
</script>
<template>
  <div class="security-note">请使用别人不知道的答案，可以填写虚构短语。不要使用公开昵称、生日或密码；知道全部答案的人可以重置你的密码。答案忽略英文大小写、全半角与多余空格。</div>
  <div v-for="(entry, index) in questions" :key="index" class="question-pair">
    <label :for="`question-${index}`">密保问题 {{ index + 1 }}</label>
    <template v-if="!recovery"><input :id="`question-${index}`" v-model="entry.question" :list="`suggestions-${index}`" minlength="3" maxlength="100" required autocomplete="off"><datalist :id="`suggestions-${index}`"><option v-for="item in suggestions" :key="item" :value="item" /></datalist></template>
    <p v-else :id="`question-${index}`" class="question-text">{{ entry.question }}</p>
    <label class="sub-label" :for="`answer-${index}`">安全码（密保答案）{{ index + 1 }}</label><input :id="`answer-${index}`" v-model="entry.answer" type="text" :minlength="recovery ? 1 : 2" maxlength="128" required autocomplete="off">
  </div>
  <button type="button" class="secondary" :disabled="!questions.some(entry => entry.answer)" @click="exportAnswers">导出当前安全码到电脑</button>
  <p class="muted">只导出当前填写的内容。服务器仅保存答案哈希，无法恢复原文。</p>
</template>
