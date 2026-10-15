const features = [
  { id: 'F01', title: '流式字幕与独立生命周期', status: 'implemented', priority: 'P0', acceptance: '同一句 Interim 原位修订，Final 后按 3 / 6 / 10 秒显示并渐隐 2 秒；多人字幕互不重置。' },
  { id: 'F02', title: '1–8 人固定分屏与阅读层级', status: 'implemented', priority: 'P0', acceptance: '按成员与加入顺序定位；最新一句醒目，溢出后跟随最新内容。动态布局保留为可选实验。' },
  { id: 'F03', title: '模拟场景与浏览器识别备选', status: 'implemented', priority: 'P0', acceptance: '默认模拟、不自动采集；包含多人重叠、长句、溢出与一分钟压力场景；浏览器 ASR 保留。' },
  { id: 'F04', title: '豆包识别与本机密钥设置', status: 'implemented', priority: 'P0', acceptance: '豆包为默认真实识别路线；Key 仅服务端读取，支持本机保存、删除与握手测试；握手不等于识别验收。' },
  { id: 'F05', title: '本地人声检测与静音停止上传', status: 'validation', priority: 'P0', acceptance: '实现已接入：本地 Silero VAD、约 500ms 句首缓冲、建连缓存及约 1.6 秒静音结束；短句、轻声、噪声和每次重新开口需真实麦克风验收。' },
  { id: 'F06', title: '异常恢复与后台稳定性', status: 'validation', priority: 'P0', acceptance: '已有取消、超时与释放逻辑；逐项实测拒绝权限、断网、切后台、长时间对话。系统挂起时不保证持续识别。' },
  { id: 'F07', title: '上传量诊断与真实用量核对', status: 'validation', priority: 'P0', acceptance: '已有开麦计时、PCM 提交 / 发送完成 / 豆包返回时长；需以同一测试时间段和云端记录核对，不能推算余额或账单。' },
  { id: 'F08', title: '真实房间与多设备字幕同步', status: 'planned', priority: 'P1', acceptance: '待确认范围：让房间码实际连接多台设备；加入、离开、断线后成员身份正确，字幕不串成员。当前仅本机房间演示。' },
  { id: 'F09', title: '成员独立收音与并发会话', status: 'discussion', priority: 'P1', acceptance: '先选择每人独立设备或共享设备收音；若采用独立采集，需实现每成员会话隔离并调整网关单会话限制。' },
  { id: 'F10', title: '房主权限与联网用量归属', status: 'discussion', priority: 'P1', acceptance: '联网前确认自带 Key 或房主提供，明确鉴权、授权和额度边界；账户余额查询另行定义。' },
  { id: 'F11', title: '安卓端的同等字幕体验', status: 'planned', priority: 'P2', acceptance: '迁移需保留本地检测、讲话上传、静音停传、句首保护和字幕规则；安卓权限、后台与真实设备需独立验收，优先级待确认。' },
  { id: 'F12', title: '眼镜显示与外部字幕输出', status: 'discussion', priority: 'P2', acceptance: '/glasses 只有静态概念预览；具体眼镜硬件、OBS 等输出需求与跨端传输方式均待确认。' },
  { id: 'F13', title: '降噪、串音过滤与说话人区分', status: 'discussion', priority: 'P2', acceptance: '现有人声检测不能证明说话人身份，也会响应电视人声。按真实环境决定是否增加降噪、声纹或其他区分能力。' },
];

const labels = { implemented: '已有实现', validation: '待实测', planned: '待实现', discussion: '待确认' };
const featureList = document.querySelector('#feature-list');
const search = document.querySelector('#feature-search');
let selectedFilter = 'all';

function renderFeatures() {
  const query = search.value.trim().toLocaleLowerCase();
  const visible = features.filter(feature => (selectedFilter === 'all' || feature.status === selectedFilter) && `${feature.id} ${feature.title} ${feature.acceptance} ${labels[feature.status]} ${feature.priority}`.toLocaleLowerCase().includes(query));
  featureList.replaceChildren();
  for (const feature of visible) {
    const row = document.createElement('article');
    row.className = 'feature-row';
    const body = document.createElement('div');
    const heading = document.createElement('h3');
    const identifier = document.createElement('span');
    identifier.className = 'feature-id';
    identifier.textContent = `${feature.id} `;
    heading.append(identifier, feature.title);
    const acceptance = document.createElement('p');
    acceptance.textContent = feature.acceptance;
    body.append(heading, acceptance);
    const status = document.createElement('span');
    status.className = `status ${feature.status}`;
    status.textContent = labels[feature.status];
    const priority = document.createElement('span');
    priority.className = 'priority';
    priority.textContent = feature.priority;
    row.append(body, status, priority);
    featureList.append(row);
  }
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '没有匹配的功能，试试其他关键词或状态。';
    featureList.append(empty);
  }
  document.querySelector('#feature-count').textContent = `显示 ${visible.length} / ${features.length} 项 · 优先级与新增范围为建议，待共同确认`;
}

for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    selectedFilter = button.dataset.filter;
    for (const candidate of document.querySelectorAll('[data-filter]')) candidate.setAttribute('aria-pressed', String(candidate === button));
    renderFeatures();
  });
}
search.addEventListener('input', renderFeatures);
renderFeatures();

const memo = document.querySelector('#memo-text');
const memoStatus = document.querySelector('#memo-status');
const storageKey = 'hakisub.product.discussion-note.v1';
// 备忘与字幕数据完全分离；存储不可用时仍允许编辑和导出。
try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) { memo.value = saved; memoStatus.textContent = '已载入本机备忘'; }
} catch { memoStatus.textContent = '浏览器存储不可用，可直接导出备忘'; }
memo.addEventListener('input', () => { memoStatus.textContent = '有未保存的修改'; });
document.querySelector('#save-memo').addEventListener('click', () => {
  try { localStorage.setItem(storageKey, memo.value); memoStatus.textContent = '已保存到当前浏览器'; }
  catch { memoStatus.textContent = '保存失败，请使用“导出备忘”'; }
});
document.querySelector('#export-memo').addEventListener('click', () => {
  const file = new Blob([`# HakiSub 产品讨论备忘\n\n${memo.value}\n`], { type: 'text/markdown;charset=utf-8' });
  const address = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = address;
  link.download = 'hakisub-product-notes.md';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(address), 1000);
  memoStatus.textContent = '已请求导出备忘；浏览器保存完成后可留档';
});

// 打印时展开问题、显示完整清单，结束后恢复筛选与折叠状态。
let collapsedBeforePrint = [];
window.addEventListener('beforeprint', () => {
  collapsedBeforePrint = [...document.querySelectorAll('details:not([open])')];
  collapsedBeforePrint.forEach(detail => { detail.open = true; });
  const previousFilter = selectedFilter;
  const previousQuery = search.value;
  selectedFilter = 'all'; search.value = ''; renderFeatures();
  selectedFilter = previousFilter; search.value = previousQuery;
});
window.addEventListener('afterprint', () => {
  collapsedBeforePrint.forEach(detail => { detail.open = false; });
  renderFeatures();
});
document.querySelector('#print').addEventListener('click', () => window.print());

const navigation = [...document.querySelectorAll('nav a')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const current = entries.filter(entry => entry.isIntersecting).sort((first, second) => first.boundingClientRect.top - second.boundingClientRect.top)[0];
    if (!current) return;
    for (const link of navigation) {
      if (link.hash === `#${current.target.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-5% 0px -60% 0px', threshold: 0 });
  document.querySelectorAll('main .section').forEach(section => observer.observe(section));
}
