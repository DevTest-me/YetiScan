/* ============================================
   YETISCAN — app.js
   ============================================ */

const SUI_RPC  = 'https://fullnode.mainnet.sui.io:443';
const API_BASE = '';

// ── State ──────────────────────────────────
let currentMode = 'token';
let aiMode      = 'pro';

let lastTokenContext    = null;
let lastContractContext = null;

const idleMessages = [
  "I'm watching the chain. Try me.",
  "Paste an address. I'll do the rest.",
  "No Move knowledge required.",
  "Whales can't hide from me.",
  "Built for Sui. Powered by AI.",
  "Your personal Sui intelligence layer.",
];
let idleIndex    = 0;
let idleInterval = null;

// ── DOM refs ───────────────────────────────
const themeToggle    = document.getElementById('themeToggle');
const modeTabs       = document.querySelectorAll('.mode-tab');
const addressInput   = document.getElementById('addressInput');
const scanBtn        = document.getElementById('scanBtn');
const clearBtn       = document.getElementById('clearBtn');
const searchHint     = document.getElementById('searchHint');

const stateIdle      = document.getElementById('stateIdle');
const stateLoading   = document.getElementById('stateLoading');
const stateError     = document.getElementById('stateError');
const tokenResult    = document.getElementById('tokenResult');
const contractResult = document.getElementById('contractResult');

// ── Theme ──────────────────────────────────
const savedTheme = localStorage.getItem('yetiscan-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('yetiscan-theme', next);
});

// ── Mode tabs ──────────────────────────────
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    searchHint.textContent = currentMode === 'token'
      ? 'Enter a Sui token coin type — e.g. 0x2::sui::SUI'
      : 'Enter a Sui package/contract address — starts with 0x';
    showIdle();
  });
});

// ── Input events ───────────────────────────
scanBtn.addEventListener('click', handleScan);
addressInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScan(); });
addressInput.addEventListener('input', () => {
  clearBtn.hidden = addressInput.value.length === 0;
});
clearBtn.addEventListener('click', () => {
  addressInput.value = '';
  clearBtn.hidden = true;
  showIdle();
});

// ── AI mode toggle ──────────────────────────
document.addEventListener('click', e => {
  if (!e.target.classList.contains('ai-mode-btn')) return;

  aiMode = aiMode === 'pro' ? 'fun' : 'pro';
  document.querySelectorAll('.ai-mode-btn').forEach(b => {
    b.textContent = aiMode === 'fun' ? '🎩 Pro Mode' : '🧊 Fun Mode';
    b.classList.toggle('fun', aiMode === 'fun');
    b.dataset.mode = aiMode;
  });

  if (!tokenResult.hidden && lastTokenContext) {
    document.getElementById('aiVerdict').innerHTML = '<div class="ai-skeleton"></div>';
    askAI(buildTokenPrompt(lastTokenContext))
      .then(text => renderAIText('aiVerdict', text))
      .catch(()  => renderAIText('aiVerdict', 'AI analysis unavailable right now.'));
  }
  if (!contractResult.hidden && lastContractContext) {
    document.getElementById('contractAiVerdict').innerHTML = '<div class="ai-skeleton"></div>';
    askAI(buildContractPrompt(lastContractContext))
      .then(text => renderAIText('contractAiVerdict', text))
      .catch(()  => renderAIText('contractAiVerdict', 'AI analysis unavailable right now.'));
  }
});

// ── Boot ───────────────────────────────────
showIdle();

// ── Scan handler ───────────────────────────
async function handleScan() {
  const raw = addressInput.value.trim();
  if (!raw) { shake(addressInput); return; }
  if (!raw.startsWith('0x')) {
    showError('Invalid address', 'Sui addresses and coin types start with 0x.');
    return;
  }
  if (currentMode === 'token') {
    await runTokenScan(raw);
  } else {
    await runContractScan(raw);
  }
}

// ── UI state machine ───────────────────────
function setUIState(state) {
  stateIdle.hidden      = true;
  stateLoading.hidden   = true;
  stateError.hidden     = true;
  tokenResult.hidden    = true;
  contractResult.hidden = true;
  stopIdleMessages();

  switch (state) {
    case 'idle':
      stateIdle.hidden = false;
      startIdleMessages();
      scanBtn.disabled = false;
      const askToken    = document.getElementById('cardAskToken');
      const askContract = document.getElementById('cardAskContract');
      if (askToken)    askToken.hidden    = true;
      if (askContract) askContract.hidden = true;
      break;
    case 'loading':
      stateLoading.hidden = false;
      scanBtn.disabled = true;
      break;
    case 'error':
      stateError.hidden = false;
      scanBtn.disabled  = false;
      break;
    case 'token':
      tokenResult.hidden = false;
      scanBtn.disabled   = false;
      break;
    case 'contract':
      contractResult.hidden = false;
      scanBtn.disabled      = false;
      break;
  }
}

function showIdle()    { setUIState('idle'); }
function showLoading() { setUIState('loading'); }

function showError(title, msg) {
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMsg').textContent   = msg;
  setUIState('error');
}

// ── Idle messages ──────────────────────────
function startIdleMessages() {
  stopIdleMessages();
  idleInterval = setInterval(() => {
    idleIndex = (idleIndex + 1) % idleMessages.length;
    const el = document.getElementById('idleLabel');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent   = idleMessages[idleIndex];
      el.style.opacity = '1';
    }, 300);
  }, 4000);
}

function stopIdleMessages() {
  clearInterval(idleInterval);
  idleInterval = null;
}

// ── Utilities ──────────────────────────────
function shake(el) {
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
  setTimeout(() => { el.style.animation = ''; }, 400);
}

function fmtNumber(n) {
  if ((!n && n !== 0) || !Number.isFinite(n)) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return n.toLocaleString();
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return '—%';
  if (n < 0.01 && n > 0) return '<0.01%';
  return n.toFixed(2) + '%';
}

function formatPrice(price) {
  if (!price || !Number.isFinite(price)) return '—';
  if (price < 0.000001) return '$' + price.toExponential(2);
  if (price < 0.01)     return '$' + price.toFixed(6);
  if (price < 1)        return '$' + price.toFixed(4);
  return '$' + price.toFixed(2);
}

function pickNum(obj, ...keys) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v === null || v === undefined || v === '' || v === '0') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function pickStr(obj, ...keys) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v && typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function safeText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function safeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHTML(value) {
  return safeText(value, '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function triggerFrostScan(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('scanning');
  requestAnimationFrame(() => { void el.offsetWidth; el.classList.add('scanning'); });
}

// ── Sui RPC ────────────────────────────────
async function suiRPC(method, params) {
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}

// ── AI ─────────────────────────────────────
async function askAI(prompt) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode: aiMode })
  });
  if (!res.ok) throw new Error('AI analysis failed');
  const data = await res.json();
  return data.result;
}

// ── Token avatar ───────────────────────────
async function setTokenAvatar(meta, symbol, coinType) {
  const avatar   = document.getElementById('tokenAvatar');
  const initials = (symbol || '?').slice(0, 2).toUpperCase();
  avatar.textContent = '';

  const candidates = [];
  if (meta.iconUrl)  candidates.push(meta.iconUrl);
  if (meta._bvLogo)  candidates.push(meta._bvLogo);

  const pkg = coinType?.split('::')?.[0];
  if (pkg) {
    candidates.push(`https://raw.githubusercontent.com/MystenLabs/sui/main/apps/icons/src/${pkg}.png`);
    candidates.push(`https://suivision.xyz/img/coins/${pkg}.png`);
  }

  const tryNext = (index) => {
    if (index >= candidates.length) { avatar.textContent = initials; return; }
    const img = document.createElement('img');
    img.alt = symbol;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.onerror = () => {
      if (avatar.contains(img)) avatar.removeChild(img);
      tryNext(index + 1);
    };
    img.onload = () => {
      if (img.naturalWidth < 4) {
        if (avatar.contains(img)) avatar.removeChild(img);
        tryNext(index + 1);
        return;
      }
      avatar.textContent = '';
      avatar.appendChild(img);
    };
    avatar.appendChild(img);
    img.src = candidates[index];
  };

  tryNext(0);
}

// ============================================
//   TOKEN SCAN
// ============================================

async function runTokenScan(coinType) {
  showLoading();
  lastTokenContext = null;

  try {
    // 1. RPC metadata
    const meta      = await suiRPC('suix_getCoinMetadata', [coinType]) || {};
    const symbol    = safeText(meta.symbol, coinType.split('::').pop() || 'TOKEN');
    const tokenName = safeText(meta.name, symbol);
    const decimals  = safeInt(meta.decimals, 9);
    const divisor   = Math.pow(10, decimals);

    // 2. Coin detail from server (price, mcap, holders, supply)
    let bvDetail = {};
    const detailPromise = fetch(`/api/coindetail?coinType=${encodeURIComponent(coinType)}`)
      .then(r => r.json())
      .then(j => { bvDetail = j?.result ?? j ?? {}; })
      .catch(() => {});

    // 3. RPC total supply (client-side)
    let rawSupply = 0n;
    try {
      const supplyData = await suiRPC('suix_getTotalSupply', [coinType]);
      rawSupply = supplyData?.value ? BigInt(supplyData.value) : 0n;
    } catch (_) {}

    await detailPromise;

    // 4. Resolve supply: client RPC → server raw string → BV number
    let supply = Number(rawSupply) / divisor;
    if (!supply || supply === 0) {
      const rawStr = bvDetail.totalSupply;
      if (rawStr && rawStr !== '0') {
        try { supply = Number(BigInt(rawStr)) / divisor; } catch (_) {}
      }
      if (!supply || supply === 0) {
        supply = pickNum(bvDetail, 'supply', 'totalSupplyFormatted', 'circulatingSupply') || 0;
      }
    }

    // 5. Logo
    if (!meta.iconUrl) {
      meta._bvLogo = pickStr(bvDetail, 'iconUrl', 'logo', 'logoUrl', 'icon', 'image');
    }

    // 6. Holders
    let holderData   = [];
    let totalFromAPI = 0;
    try {
      const hvRes  = await fetch(`/api/holders?coinType=${encodeURIComponent(coinType)}`);
      const hvJson = await hvRes.json();
      holderData   = hvJson?.data ?? [];
      totalFromAPI = Number(hvJson?.totalElements ?? 0);
    } catch (_) {}

    const holderMap = {};
    for (const holder of holderData) {
      const addr = holder.address ?? holder.owner ?? holder.account ?? 'unknown';
      if (!addr || addr === 'unknown') continue;
      const rawBal = holder.amount ?? holder.balance ?? '0';
      const parsed = Number(String(rawBal));
      if (!Number.isFinite(parsed) || parsed <= 0) continue;
      const bal = parsed > supply * 1.1 ? parsed / divisor : parsed;
      if (bal <= 0) continue;
      holderMap[addr] = (holderMap[addr] || 0) + bal;
    }

    const sampledCount   = Object.keys(holderMap).length;
    const holdersMissing = sampledCount === 0;
    const sortedHolders  = Object.entries(holderMap).sort((a, b) => b[1] - a[1]);
    const top10Total     = sortedHolders.reduce((s, [, v]) => s + v, 0);
    const top10Pct       = (supply > 0 && top10Total > 0) ? (top10Total / supply * 100) : null;

    // 7. Market data
    const totalHolders = totalFromAPI || pickNum(bvDetail, 'holders', 'holderCount', 'totalHolders');
    const price = pickNum(bvDetail, 'price', 'tokenPrice', 'currentPrice', 'priceUsd');
    const vol   = pickNum(bvDetail, 'vol24h', 'volume24h', 'volume');
    const liq   = pickNum(bvDetail, 'liquidity', 'tvl', 'totalLiquidity');
    const buys  = pickNum(bvDetail, 'buyCount24h', 'buys24h', 'buys') ?? 0;
    const sells = pickNum(bvDetail, 'sellCount24h', 'sells24h', 'sells') ?? 0;
    const tradeTotal = buys + sells;

    let mcap = pickNum(bvDetail, 'marketCap', 'market_cap', 'fdv');
    if (!mcap && price && supply) mcap = price * supply;

    // 8. Trust score
    const score = calcTrustScore({ top10Pct, supply });

    if (currentMode !== 'token') return;

    // 9. Render
    setUIState('token');
    setTokenAvatar(meta, symbol, coinType);

    document.getElementById('tokenName').textContent     = tokenName;
    document.getElementById('tokenSymbol').textContent   = symbol;
    document.getElementById('tokenSupply').textContent   = fmtNumber(supply);
    document.getElementById('tokenDecimals').textContent = decimals;

    // Package ID — click to analyse contract
    const pkgEl   = document.getElementById('tokenPackage');
    const pkgHint = document.getElementById('pkgHint');
    const copyBtn = document.getElementById('copyPkgBtn');
    const pkgAddr = coinType.split('::')[0];

    pkgEl.textContent = coinType;
    pkgEl.title       = coinType;
    pkgHint.hidden    = false;
    copyBtn.hidden    = false;

    pkgEl.onclick = () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      document.querySelector('[data-mode="contract"]').classList.add('active');
      currentMode = 'contract';
      searchHint.textContent = 'Enter a Sui package/contract address — starts with 0x';
      addressInput.value = pkgAddr;
      clearBtn.hidden    = false;
      handleScan();
    };

    copyBtn.onclick = (e) => {
      e.stopPropagation();
      const fallbackCopy = (text) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try {
          document.execCommand('copy');
          copyBtn.textContent = '✓';
        } catch (_) {
          copyBtn.textContent = '✗';
        }
        document.body.removeChild(ta);
        setTimeout(() => { copyBtn.textContent = '⎘'; }, 1500);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(pkgAddr)
          .then(() => { copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⎘'; }, 1500); })
          .catch(() => fallbackCopy(pkgAddr));
      } else {
        fallbackCopy(pkgAddr);
      }
    };

    document.getElementById('tokenPrice').textContent = formatPrice(price);
    document.getElementById('tokenMcap').textContent  = mcap ? '$' + fmtNumber(mcap) : '—';

    const holdersEl = document.getElementById('tokenHolders');
    if (totalHolders) {
      holdersEl.textContent = fmtNumber(totalHolders);
    } else if (holdersMissing) {
      holdersEl.textContent = 'Unavailable';
    } else {
      holdersEl.textContent = sampledCount + '+ sampled';
    }

    document.getElementById('tokenVolume').textContent    = vol ? '$' + fmtNumber(vol) : '—';
    document.getElementById('tokenLiquidity').textContent = liq ? '$' + fmtNumber(liq) : '—';

    if (tradeTotal > 0) {
      const buyPct  = buys  / tradeTotal * 100;
      const sellPct = sells / tradeTotal * 100;
      document.getElementById('tokenBuys').textContent  = buys  + ' (' + buyPct.toFixed(0)  + '%)';
      document.getElementById('tokenSells').textContent = sells + ' (' + sellPct.toFixed(0) + '%)';
      document.getElementById('buyBar').style.width  = buyPct  + '%';
      document.getElementById('sellBar').style.width = sellPct + '%';
      document.getElementById('buySellWrap').hidden = false;
    } else {
      document.getElementById('buySellWrap').hidden = true;
      document.getElementById('tokenBuys').textContent  = '—';
      document.getElementById('tokenSells').textContent = '—';
    }

    document.getElementById('cardMarket').hidden = !(price || mcap || vol || liq || tradeTotal > 0);

    renderScoreRing(score, top10Pct);
    renderRiskFlags(score, top10Pct);
    renderHolderBars(sortedHolders, supply);

    document.getElementById('holderMeta').textContent = holdersMissing
      ? 'Holder data unavailable'
      : top10Pct !== null
        ? 'Top ' + sampledCount + ' holders · ' + fmtPct(top10Pct) + ' of supply'
        : 'Top ' + sampledCount + ' holders sampled';

    triggerFrostScan('frostScan');

    // 10. AI
    lastTokenContext = { meta: { ...meta, name: tokenName, symbol }, supply, decimals, top10Pct, sampledCount, holdersMissing, score, sortedHolders, coinType, price, mcap, vol, liq, buys, sells, total: tradeTotal };
    document.getElementById('aiVerdict').innerHTML = '<div class="ai-skeleton"></div>';
    askAI(buildTokenPrompt(lastTokenContext))
      .then(text => {
        renderAIText('aiVerdict', text);
        renderAskCard('cardAskToken', 'askTokenChips', 'askTokenAnswer', 'askTokenMeta', lastTokenContext, 'token');
      })
      .catch(() => renderAIText('aiVerdict', 'AI analysis unavailable right now. The on-chain data above is accurate.'));

  } catch (err) {
    showError('Scan failed', err.message || 'Could not fetch token data. Check the coin type and try again.');
  }
}

// ── Trust score ────────────────────────────
function calcTrustScore({ top10Pct, supply }) {
  let score = 75;
  if (top10Pct !== null) {
    if (top10Pct > 80)      score -= 40;
    else if (top10Pct > 60) score -= 25;
    else if (top10Pct > 40) score -= 10;
    else if (top10Pct > 20) score -= 3;
    else                    score += 15;
  }
  if (!supply || supply === 0) score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function renderScoreRing(score, top10Pct) {
  const arc     = document.getElementById('scoreArc');
  const numEl   = document.getElementById('scoreNumber');
  const verdict = document.getElementById('scoreVerdict');
  const offset  = 314 - (score / 100) * 314;

  numEl.textContent = score;

  let color, text;
  if (score >= 80)      { color = 'var(--safe)';   text = 'Healthy Distribution'; }
  else if (score >= 60) { color = 'var(--warn)';   text = 'Moderate Risk'; }
  else                  { color = 'var(--danger)'; text = 'High Concentration Risk'; }

  if (top10Pct === null) { color = 'var(--text-secondary)'; text = 'Insufficient Data'; }

  arc.style.stroke           = color;
  arc.style.strokeDashoffset = 314;
  requestAnimationFrame(() => { arc.style.strokeDashoffset = offset; });
  numEl.style.color      = color;
  verdict.textContent    = text;
  verdict.style.color    = color;
}

function renderRiskFlags(score, top10Pct) {
  const container = document.getElementById('riskFlags');
  const flags = [];

  if (top10Pct === null) {
    flags.push({ type: 'warn', text: 'Concentration data unavailable' });
  } else if (top10Pct > 60) {
    flags.push({ type: 'danger', text: 'Top holders own ' + fmtPct(top10Pct) });
  } else if (top10Pct > 30) {
    flags.push({ type: 'warn', text: 'Top holders own ' + fmtPct(top10Pct) });
  } else {
    flags.push({ type: 'safe', text: 'Well distributed (' + fmtPct(top10Pct) + ')' });
  }

  if (score >= 80)      flags.push({ type: 'safe',   text: 'Low rug risk' });
  else if (score >= 60) flags.push({ type: 'warn',   text: 'Monitor whale activity' });
  else                  flags.push({ type: 'danger', text: 'High whale concentration' });

  container.innerHTML = flags.map(f =>
    '<div class="risk-flag risk-flag--' + f.type + '">' +
    '<span class="risk-flag-dot"></span>' + escapeHTML(f.text) + '</div>'
  ).join('');
}

function renderHolderBars(holders, supply) {
  const container = document.getElementById('holderBars');
  if (!holders.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">Holder data unavailable for this token.</p>';
    return;
  }
  const max = holders[0]?.[1] || 1;
  container.innerHTML = holders.map(([addr, bal]) => {
    const pct    = (supply > 0 && bal > 0) ? (bal / supply * 100) : 0;
    const barPct = Math.max(0, Math.min(100, bal / max * 100));
    const pctStr = (pct < 0.01 && pct > 0) ? '<0.01%' : pct.toFixed(2) + '%';
    return '<div class="holder-row">' +
      '<span class="holder-addr" title="' + escapeHTML(addr) + '">' + escapeHTML(shortAddr(addr)) + '</span>' +
      '<div class="holder-bar-track"><div class="holder-bar-fill" style="width:' + barPct + '%"></div></div>' +
      '<span class="holder-pct">' + pctStr + '</span>' +
      '</div>';
  }).join('');
}

function buildTokenPrompt({ meta, supply, decimals, top10Pct, sampledCount, holdersMissing, score, sortedHolders, coinType, price, mcap, vol, liq, buys, sells, total }) {
  const concentrationInfo = top10Pct !== null
    ? 'Top ' + sampledCount + ' holder concentration: ' + fmtPct(top10Pct) + ' of total supply'
    : 'Holder concentration: data unavailable';

  const topHolder    = sortedHolders[0];
  const topHolderPct = (topHolder && supply > 0) ? (topHolder[1] / supply * 100) : null;

  const holderLines = sortedHolders.slice(0, 5).map(([a, v]) => {
    const pct = (supply > 0 && v > 0) ? fmtPct(v / supply * 100) : 'unknown %';
    return '  ' + shortAddr(a) + ': ' + pct;
  }).join('\n');

  const verdictLine = score >= 80
    ? 'End with a clear verdict: this token appears reasonably safe but always do your own research.'
    : score >= 60
    ? 'End with a clear verdict: moderate risk, proceed with caution.'
    : 'End with a clear verdict: HIGH RISK. Be direct. Do not soften this.';

  const personality = aiMode === 'fun'
    ? 'You are YetiScan - a sharp crypto analyst who writes like a knowledgeable friend texting from a trading terminal. Confident, direct, occasionally savage but always accurate. Lead with the single most alarming or reassuring fact. Use one punchy metaphor per paragraph. Never use bullet points. Max 180 words.'
    : 'You are YetiScan - a professional blockchain intelligence tool writing for a non-technical reader. Two paragraphs only. Open with the single most important fact. Paragraph 2: honest risk assessment. Be specific with numbers. No bullet points. Max 150 words.';

  return personality + '\n\n' +
    'TOKEN: ' + meta.name + ' (' + meta.symbol + ')\n' +
    'Total Supply: ' + fmtNumber(supply) + '\n' +
    (price  ? 'Price: ' + formatPrice(price) + '\n' : '') +
    (mcap   ? 'Market Cap: $' + fmtNumber(mcap) + '\n' : '') +
    (vol    ? '24h Volume: $' + fmtNumber(vol) + '\n' : '') +
    (total > 0 ? 'Buy/Sell 24h: ' + buys + ' buys vs ' + sells + ' sells\n' : '') +
    'Trust Score: ' + score + '/100\n' +
    concentrationInfo + '\n' +
    (topHolderPct !== null ? 'Largest single holder: ' + fmtPct(topHolderPct) + ' of total supply\n' : '') +
    '\nTOP SAMPLED HOLDERS:\n' + (holderLines || '  (no holder data)') + '\n' +
    '\nRULES:\n' +
    '- If top10Pct > 60%: this is a RED FLAG. Use those exact words.\n' +
    '- If top10Pct is 30–60%: MODERATE RISK.\n' +
    '- If top10Pct < 30%: POSITIVE sign. Healthy distribution.\n' +
    '- If holdersMissing: skip concentration, assess using price/volume/mcap only.\n' +
    '- Never invent data not provided above.\n' +
    '- ' + verdictLine;
}

// ============================================
//   CONTRACT SCAN
// ============================================

async function runContractScan(packageId) {
  showLoading();
  lastContractContext = null;

  packageId = packageId.split('::')[0];

  try {
    const pkg = await suiRPC('sui_getObject', [
      packageId,
      { showContent: true, showType: true, showOwner: true, showPreviousTransaction: true }
    ]);

    if (!pkg?.data) throw new Error('Package not found. Check the contract address.');

    const objData   = pkg.data || {};
    const objType   = safeText(objData.type, '').toLowerCase();
    const isPackage = objType === 'package' || objData.content?.dataType === 'package';

    if (!isPackage) {
      throw new Error('This address is not a package/contract. Try a token address in Token Analysis mode.');
    }

    let modules = {};
    try {
      const modulesRes = await suiRPC('sui_getNormalizedMoveModulesByPackage', [packageId]);
      modules = modulesRes && typeof modulesRes === 'object' ? modulesRes : {};
    } catch (_) {}

    const moduleNames = Object.keys(modules);
    const moduleCount = moduleNames.length;

    const allFunctions = [];
    for (const [modName, mod] of Object.entries(modules)) {
      const exposed = mod?.exposedFunctions ?? {};
      for (const [fnName, fn] of Object.entries(exposed)) {
        allFunctions.push({
          module: modName,
          name: fnName,
          visibility: safeText(fn?.visibility, 'Unknown'),
          isEntry: Boolean(fn?.isEntry)
        });
      }
    }

    const publicFns = allFunctions.filter(f => f.visibility.toLowerCase() === 'public' || f.isEntry);
    const risks     = detectContractRisks(packageId, moduleNames, allFunctions);

    const txDigest = objData.previousTransaction;
    let publishedAt = '—';
    if (txDigest) {
      try {
        const tx = await suiRPC('sui_getTransactionBlock', [txDigest, { showInput: true }]);
        const ts = tx?.timestampMs;
        if (ts) publishedAt = new Date(Number(ts)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch (_) {}
    }

    if (currentMode !== 'contract') return;

    setUIState('contract');

    document.getElementById('contractPackage').textContent   = packageId;
    document.getElementById('contractPackage').title         = packageId;
    document.getElementById('contractModules').textContent   = moduleCount || '—';
    document.getElementById('contractPublished').textContent = publishedAt;
    document.getElementById('contractStatus').textContent    = 'Immutable';

    renderRiskGrid(risks);
    renderFuncList(publicFns.slice(0, 12));
    document.getElementById('funcMeta').textContent = publicFns.length + ' public · ' + allFunctions.length + ' total';
    triggerFrostScan('frostScanContract');

    lastContractContext = { packageId, moduleNames, publicFns, risks, publishedAt };
    document.getElementById('contractAiVerdict').innerHTML = '<div class="ai-skeleton"></div>';
    askAI(buildContractPrompt(lastContractContext))
      .then(text => {
        renderAIText('contractAiVerdict', text);
        renderAskCard('cardAskContract', 'askContractChips', 'askContractAnswer', 'askContractMeta', lastContractContext, 'contract');
      })
      .catch(() => renderAIText('contractAiVerdict', 'AI analysis unavailable right now. The contract data above is accurate.'));

  } catch (err) {
    showError('Scan failed', err.message || 'Could not fetch contract data. Check the package address.');
  }
}

function detectContractRisks(packageId, moduleNames, fns) {
  const risks      = [];
  const packageKey = safeText(packageId, '').toLowerCase();
  const isCore     = ['0x1', '0x2', '0x3'].includes(packageKey);
  const fnNames    = fns.map(f => f.name.toLowerCase());

  const check = (name, status, type) => {
    risks.push({ name, status, type, icon: type === 'safe' ? '✓' : type === 'danger' ? '✗' : '⚠' });
  };

  check('Immutable Package', 'Cannot be altered after deploy', 'safe');

  if (isCore) {
    check('Mint Authority', 'Core framework — capability-gated', 'safe');
    check('Pause / Freeze', 'No package-level pause control',   'safe');
    check('Admin Controls', 'No mutable package admin',         'safe');
    check('Burn Function',  'Framework-level lifecycle only',   'safe');
    check('Blacklist',      'No blacklist detected',            'safe');
    return risks;
  }

  const hasMint      = fnNames.some(f => f.includes('mint')      || f.includes('issue'));
  const hasPause     = fnNames.some(f => f.includes('pause')     || f.includes('freeze') || f.includes('lock'));
  const hasAdmin     = fnNames.some(f => f.includes('admin')     || f.includes('owner')  || f.includes('setfee') || f.includes('update'));
  const hasBurn      = fnNames.some(f => f.includes('burn')      || f.includes('destroy'));
  const hasBlacklist = fnNames.some(f => f.includes('blacklist') || f.includes('blocklist') || f.includes('ban'));

  check('Mint Authority', hasMint      ? 'Mint function detected'      : 'No mint function',        hasMint      ? 'warn'   : 'safe');
  check('Pause / Freeze', hasPause     ? 'Contract can be paused'      : 'No pause function',       hasPause     ? 'warn'   : 'safe');
  check('Admin Controls', hasAdmin     ? 'Admin functions present'     : 'No admin controls found', hasAdmin     ? 'warn'   : 'safe');
  check('Burn Function',  hasBurn      ? 'Tokens can be burned'        : 'No burn function',        hasBurn      ? 'warn'   : 'safe');
  check('Blacklist',      hasBlacklist ? 'Blacklist capability exists' : 'No blacklist detected',   hasBlacklist ? 'danger' : 'safe');

  return risks;
}

function renderRiskGrid(risks) {
  document.getElementById('riskGrid').innerHTML = risks.map(r =>
    '<div class="risk-item risk-item--' + r.type + '">' +
    '<span class="risk-item-icon">' + escapeHTML(r.icon) + '</span>' +
    '<div class="risk-item-info">' +
    '<span class="risk-item-name">' + escapeHTML(r.name) + '</span>' +
    '<span class="risk-item-status">' + escapeHTML(r.status) + '</span>' +
    '</div></div>'
  ).join('');
}

function renderFuncList(fns) {
  if (!fns.length) {
    document.getElementById('funcList').innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No public functions found.</p>';
    return;
  }
  document.getElementById('funcList').innerHTML = fns.map(f =>
    '<div class="func-item">' +
    '<span class="func-badge">' + (f.isEntry ? 'ENTRY' : 'PUBLIC') + '</span>' +
    '<div><div class="func-name">' + escapeHTML(f.module) + '::' + escapeHTML(f.name) + '</div></div>' +
    '</div>'
  ).join('');
}

function buildContractPrompt({ packageId, moduleNames, publicFns, risks, publishedAt }) {
  const riskLines = risks.map(r => {
    const prefix = r.type === 'danger' ? '🔴 DANGER' : r.type === 'warn' ? '🟡 WARNING' : '🟢 SAFE';
    return prefix + ' — ' + r.name + ': ' + r.status;
  }).join('\n');

  const fnList      = publicFns.slice(0, 8).map(f => f.name).join(', ') || 'NONE';
  const dangerCount = risks.filter(r => r.type === 'danger').length;
  const warnCount   = risks.filter(r => r.type === 'warn').length;
  const overallRisk = dangerCount > 0 ? 'HIGH RISK' : warnCount > 1 ? 'MODERATE RISK' : 'LOW RISK';
  const modules     = moduleNames.length ? moduleNames.join(', ') : 'NONE';
  const noFns       = publicFns.length === 0 ? 'No public functions exist. This contract runs in the background, called by other contracts.' : '';

  const pro = 'Write 2 short paragraphs for a non-technical reader. Para 1: what this contract does based ONLY on module/function names below. Para 2: what the security findings mean for a user. End with one verdict line. No bullet points. Max 120 words.';
  const fun = 'You are a sharp crypto analyst texting a friend. 2 short paragraphs. Para 1: what this contract does in one punchy sentence, based ONLY on the module/function names below. Para 2: security verdict with one analogy. End with a clear one-line verdict. No bullet points. Max 140 words.';

  return (aiMode === 'fun' ? fun : pro) + '\n\n' +
    'FACTS — use ONLY these:\n' +
    'Package: ' + shortAddr(packageId) + ' | Published: ' + publishedAt + '\n' +
    'Modules: ' + modules + '\n' +
    'Functions: ' + fnList + '\n' +
    (noFns ? noFns + '\n' : '') +
    'Overall risk: ' + overallRisk + '\n\n' +
    'SECURITY FINDINGS:\n' + riskLines + '\n\n' +
    'RULES:\n' +
    '- Only reference modules and functions listed above. Never invent names.\n' +
    '- SAFE = feature is ABSENT. Say "cannot be frozen" not "is safe regarding freeze".\n' +
    '- No hedging: "likely", "appears", "may", "suggests".\n' +
    '- If functions are NONE, say the contract runs silently in the background.';
}

// ============================================
//   ASK YETISCAN
// ============================================

async function generateAskQuestions(context, type) {
  const prompt = type === 'token'
    ? 'You are YetiScan. Based on this token data, generate exactly 3 short questions a non-technical user would want answered. Make them specific to THIS token\'s actual data. Each question max 8 words. Return ONLY a JSON array of 3 strings, nothing else.\n\nTOKEN: ' + context.meta.name + ' (' + context.meta.symbol + ')\nTrust Score: ' + context.score + '/100\n' + (context.top10Pct !== null ? 'Top holder concentration: ' + fmtPct(context.top10Pct) : 'Holder data unavailable') + '\n' + (context.price ? 'Price: ' + formatPrice(context.price) : '') + '\n' + (context.mcap ? 'Market Cap: $' + fmtNumber(context.mcap) : '')
    : 'You are YetiScan. Based on this contract data, generate exactly 3 short questions a non-technical user would want answered. Each question max 8 words. Return ONLY a JSON array of 3 strings, nothing else.\n\nModules: ' + context.moduleNames.join(', ') + '\nRisk level: ' + (context.risks.filter(r => r.type === 'danger').length > 0 ? 'HIGH' : context.risks.filter(r => r.type === 'warn').length > 1 ? 'MODERATE' : 'LOW') + '\nFindings: ' + context.risks.filter(r => r.type !== 'safe').map(r => r.name).join(', ');

  try {
    const res  = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode: 'pro' })
    });
    const data  = await res.json();
    const clean = (data.result || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (_) {
    return type === 'token'
      ? ['Is this token safe to buy?', 'Who controls most of the supply?', 'What does the trust score mean?']
      : ['Is this contract safe to use?', 'What can the owner do to my funds?', 'What does immutable mean here?'];
  }
}

async function answerAskQuestion(question, context, type) {
  const contextStr = type === 'token'
    ? 'TOKEN: ' + context.meta.name + ' (' + context.meta.symbol + ')\nTrust Score: ' + context.score + '/100\n' + (context.top10Pct !== null ? 'Top concentration: ' + fmtPct(context.top10Pct) : 'Holder data unavailable') + '\n' + (context.price ? 'Price: ' + formatPrice(context.price) + '\n' : '') + (context.mcap ? 'Market Cap: $' + fmtNumber(context.mcap) + '\n' : '') + (context.sortedHolders.length ? 'Largest holder: ' + fmtPct(context.sortedHolders[0][1] / context.supply * 100) : '')
    : 'Modules: ' + context.moduleNames.join(', ') + '\nFunctions: ' + context.publicFns.slice(0, 6).map(f => f.name).join(', ') + '\nSecurity: ' + context.risks.map(r => (r.type === 'danger' ? '🔴' : r.type === 'warn' ? '🟡' : '🟢') + ' ' + r.name).join(', ');

  const prompt = 'You are YetiScan. Answer this question about the data below in 2-3 sentences max. Direct, plain English, no jargon. No bullet points.\n\nDATA:\n' + contextStr + '\n\nQUESTION: ' + question;

  const res  = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode: aiMode })
  });
  const data = await res.json();
  return data.result || 'Unable to answer right now.';
}

function renderAskCard(cardId, chipsId, answerId, metaId, context, type) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.hidden = false;

  const chipsEl  = document.getElementById(chipsId);
  const answerEl = document.getElementById(answerId);
  const metaEl   = document.getElementById(metaId);

  chipsEl.innerHTML = '<div class="ai-skeleton" style="height:36px;border-radius:100px;"></div>';
  answerEl.hidden = true;

  generateAskQuestions(context, type).then(questions => {
    chipsEl.innerHTML = questions.map((q, i) =>
      '<button class="ask-chip" data-index="' + i + '">' + escapeHTML(q) + '</button>'
    ).join('');

    chipsEl.querySelectorAll('.ask-chip').forEach(chip => {
      chip.addEventListener('click', async function() {
        const question = this.textContent;
        chipsEl.querySelectorAll('.ask-chip').forEach(c => { c.classList.remove('active'); c.disabled = true; });
        this.classList.add('active');

        answerEl.hidden = false;
        answerEl.innerHTML = '<div class="ai-skeleton"></div>';
        metaEl.textContent = 'Answering...';

        try {
          const answer     = await answerAskQuestion(question, context, type);
          const paragraphs = answer.trim().split(/\n\n+/).filter(Boolean);
          answerEl.innerHTML = paragraphs.map(p => '<p>' + escapeHTML(p.trim()) + '</p>').join('');
          metaEl.textContent = 'Tap another question';
        } catch (_) {
          answerEl.innerHTML = '<p>Unable to answer right now.</p>';
          metaEl.textContent = 'Tap a question below';
        }

        chipsEl.querySelectorAll('.ask-chip').forEach(c => { c.disabled = false; });
      });
    });

    metaEl.textContent = 'Tap a question below';
  });
}

// ── Render AI text ─────────────────────────
function renderAIText(elId, text) {
  const el = document.getElementById(elId);
  if (!el) return;
  const paragraphs = safeText(text, '').trim().split(/\n\n+/).filter(Boolean);
  el.innerHTML = paragraphs.length
    ? paragraphs.map(p => '<p>' + escapeHTML(p.trim()) + '</p>').join('')
    : '<p>AI analysis unavailable right now. The on-chain data above is accurate.</p>';
}

// ── Shake keyframe ─────────────────────────
const _style = document.createElement('style');
_style.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}';
document.head.appendChild(_style);
