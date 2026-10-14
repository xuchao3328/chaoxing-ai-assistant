// ==UserScript==
// @name         超星学习通小助手（AI 答题版）
// @namespace    xuchao3328
// @version      4.2
// @description  支持超星视频、文档、章节测试（全部题目由 AI 大模型作答）、人脸验证自动通过、自定义正确率、掉线自动登录。取消视频文件加载，多开也不占用网速；防清进度，无不良记录。
// @author       xuchao3328
// @run-at       document-end
// @storageName  unrivalxxt
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @match        *://*.nbdlib.cn/*
// @match        *://*.hnsyu.net/*
// @match        *://*.ac.cn/*
// @icon         http://pan-yz.chaoxing.com/favicon.ico
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_info
// @require      https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/crypto-js.min.js
// @connect      mooc1-1.chaoxing.com
// @connect      mooc1.chaoxing.com
// @connect      mooc1-2.chaoxing.com
// @connect      passport2-api.chaoxing.com
// @connect      14.29.190.187
// @connect      api.deepseek.com
// @connect      api.xiaomimimo.com
// @connect      dashscope.aliyuncs.com
// @connect      open.bigmodel.cn
// @connect      api.moonshot.cn
// @connect      ark.cn-beijing.volces.com
// @connect      qianfan.baidubce.com
// @connect      api.siliconflow.cn
// @connect      api.openai.com
// @connect      localhost
// @connect      *
// @license      GPL-3.0-or-later

//@ 如果脚本提示添加安全网址，请将脚本提示内容填写到下方区域，一行一个



//@ 安全网址请填写在上方空白区域
// ==/UserScript==
(() => {
    var jumpType = 1, // 0:智能模式，1:遍历模式，2:不跳转，如果智能模式出现无限跳转/不跳转情况，请切换为遍历模式
        disableMonitor = 0, // 0:无操作，1:解除多端学习监控，开启此功能后可以多端学习，不会被强制下线。
        randomDo = 1, //将0改为1，找不到答案的单选、多选、判断就会自动选【B、ABCD、错】，只在规定正确率不为100%时才生效
        backGround = 0, //是否对接超星挂机小助手，需要先安装对应脚本
        //-----------------------------------------------------------------------------------------------------
        autoLogin = 0, //掉线是否自动登录，1为自动登录，需要配置登录信息（仅支持手机号+密码登陆）
        phoneNumber = '', //自动登录的手机号，填写在单引号之间。
        password = ''; //自动登录的密码，填写在单引号之间。
    //-----------------------------------------------------------------------------------------------------
    var host = 'http://14.29.190.187:54223/',
        rate = GM_getValue('unrivalrate', '1'),//倍速
        accuracy = GM_getValue('accuracy',60),//章节测试正确率百分比，在答题正确率在规定之上并且允许自动提交时才会提交答案
        //======================= AI 答题配置（题库已移除，全部走 AI）=======================
        // 是否启用 AI 答题（1=开启，0=关闭）
        aiEnable = 1,
        // AI 接口地址，兼容 OpenAI Chat Completions 格式的任意服务（DeepSeek/通义/智谱/Ollama/自建中转均可）
        aiUrl = 'https://api.deepseek.com/chat/completions',
        // AI 模型名（DeepSeek: deepseek-chat；通义: qwen-plus；智谱: glm-4-flash；Ollama: qwen2.5 等）
        aiModel = 'deepseek-chat',
        // AI 接口密钥，填写在单引号之间（不要提交到公开仓库）
        aiKey = '',
        // AI 请求超时（毫秒），超时后放弃并走原有随机兜底（推理模型可调大到 60000）
        aiTimeout = 30000,
        // AI 并发上限：同一时刻最多同时问几道题（1=严格串行，最稳；如需提速可自行调大）
        aiMaxConcurrent = 1,
        // AI 温度，答题场景建议 0 保证稳定
        aiTemperature = 0,
        // 是否在 AI 回答前把选项一并交给 AI（1=给选项，答案更准；0=只给题干）
        aiWithOptions = 1,
        // 模型预设：选一个会自动填好「接口地址 + 模型名」，密钥仍需自己填。
        // 全部走 OpenAI Chat Completions 兼容格式，故可自由混用。
        aiPresets = [
            { name: 'DeepSeek（推荐·快）', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
            { name: '小米 MiMo V2.5', url: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5' },
            { name: '小米 MiMo V2.5 Pro（深度推理）', url: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-pro' },
            { name: '自定义（手动填写）', url: '', model: '' }
        ],
        getQueryVariable = (variable) => {
            let q = _l.search.substring(1),
                v = q.split("&"),
                r = false;
            for (let i = 0, l = v.length; i < l; i++) {
                let p = v[i].split("=");
                p[0] == variable && (r = p[1]);
            }
            return r;
        },
        getCookie = name => `; ${document.cookie}`.split(`; ${name}=`).pop().split(';').shift(),
        isCat = GM_info.scriptHandler == 'ScriptCat',
        _w = unsafeWindow,
        _d = _w.document,
        _l = _w.location,
        _p = _l.protocol,
        _h = _l.host,
        //isEdge = _w.navigator.userAgent.includes("Edg/"),
        isFf = _w.navigator.userAgent.includes("Firefox"),
        isMobile = _w.navigator.userAgent.includes("Android"),
        stop = false,
        handleImgs = (s) => {
            imgEs = s.match(/(<img([^>]*)>)/);
            if (imgEs) {
                for (let j = 0, k = imgEs.length; j < k; j++) {
                    let urls = imgEs[j].match(
                        /http[s]?:\/\/(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+/),
                        url;
                    if (urls) {
                        url = urls[0].replace(/http[s]?:\/\//, '');
                        s = s.replaceAll(imgEs[j], url);
                    }
                }
            }
            return s;
        },
        trim = (s) => {
            return handleImgs(s).replaceAll('javascript:void(0);', '').replaceAll("&nbsp;", '').replaceAll("，", ',').replaceAll(
                "。", '.').replaceAll("：", ':').replaceAll("；",
                    ';').replaceAll("？", '?').replaceAll("（", '(').replaceAll("）", ')').replaceAll("“", '"')
                .replaceAll("”", '"').replaceAll("！", '!').replaceAll("-", ' ').replace(/(<([^>]+)>)/ig, '')
                .replace(/^\s+/ig, '').replace(/\s+$/ig, '');
        },
        cVersion = 999,
        classId = getQueryVariable('clazzid') || getQueryVariable('clazzId') || getQueryVariable('classid') ||
            getQueryVariable('classId'),
        courseId = getQueryVariable('courseid') || getQueryVariable('courseId'),
        UID = getCookie('_uid') || getCookie('UID'),
        FID = getCookie('fid'),
        jq = _w.top.$ || _w.top.jQuery;
    _w.confirm = (msg) => {
        return true;
    }
    setInterval(function () {
        _w.confirm = (msg) => {
            return true;
        }
    }, 2000);

    // —— 读取已保存的 AI 兜底配置 ——
    // 必须放在「顶层作用域」：答题发生在 work/phone/doHomeWork 这个 iframe 里，
    // 若只在 knowledge/cards 分支读取，答题页会拿不到 Key/地址而报「AI未启用或未配置」。
    try {
        var _aiUrlCfg = GM_getValue('aiUrl'); if (_aiUrlCfg) aiUrl = _aiUrlCfg;
        var _aiModelCfg = GM_getValue('aiModel'); if (_aiModelCfg) aiModel = _aiModelCfg;
        var _aiKeyCfg = GM_getValue('aiKey'); if (_aiKeyCfg) aiKey = _aiKeyCfg;
        // 并发固定为 1（串行），超时固定 30s：面板已移除对应设置项
        aiMaxConcurrent = 1;
        aiTimeout = 30000;
    } catch (e) { }

    /* ============================================================
     *  AI 答题模块（题库已移除，全部题目直接由大模型作答）
     *  流程：串行取题 → 调 AI → 解析出「选项字母」→ 精确点击对应选项。
     *  统一输出：返回「候选答案数组」（优先为字母），由同一套匹配逻辑消费。
     * ============================================================ */

    // —— 简单并发闸门：控制同时进行的 AI 请求数 ——
    var aiRunning = 0,
        aiQueue = [];
    var aiAcquire = function () {
        return new Promise(function (resolve) {
            var tryRun = function () {
                if (aiRunning < aiMaxConcurrent) {
                    aiRunning += 1;
                    resolve();
                } else {
                    aiQueue.push(tryRun);
                }
            };
            tryRun();
        });
    };
    var aiRelease = function () {
        aiRunning -= 1;
        if (aiQueue.length > 0) {
            var next = aiQueue.shift();
            next();
        }
    };

    // —— 把题目 + 选项拼成给 AI 的提示词：给出「字母 + 正文」，并要求只回字母 ——
    // 让 AI 回答「选项字母」而非「选项正文」，可从根上消除文字匹配失败导致的选错。
    var buildAiPrompt = function (qu) {
        var isJudge = qu['type'] === '判断题';
        // 指令放最前（模型对「先给规则」的遵循度更高），且尽量短：输入越短、首字延迟越低
        var head = isJudge
            ? '判断题：只回答「正确」或「错误」，不要解释。'
            : (qu['type'] === '多选题'
                ? '多选题：只回答所有正确选项的字母，连写不加分隔符（如 ABD），不要解释。'
                : '单选题：只回答正确选项的一个字母（如 A），不要解释。');
        var lines = [head, '', qu['question']];
        if (!isJudge) {
            for (var key in qu['options']) {
                if (key === 'length') continue;
                lines.push(key + '. ' + (qu['options'][key]['text'] || ''));
            }
        }
        return lines.join('\n');
    };

    // —— 解析 AI 输出为「候选答案数组」——
    // 优先解析成选项字母（['A','C']）；若不是纯字母则按正文处理（判断题固定输出「正确/错误」）。
    var parseAiAnswer = function (qu, text) {
        var t = String(text || '').replace(/\r?\n/g, ' ').trim();
        if (t === '') return [];
        if (qu['type'] === '判断题') {
            if (/正确|对的|对|是|√|true/i.test(t) && !/错误|不对|否|×|false/i.test(t)) return ['正确'];
            if (/错误|不对|否|×|false/i.test(t)) return ['错误'];
            if (/t/i.test(t)) return ['正确'];
            if (/f/i.test(t)) return ['错误'];
            return [];
        }
        var valid = [];
        for (var k in qu['options']) {
            if (k === 'length') continue;
            valid.push(String(k).toUpperCase());
        }
        var stripped = t.replace(/^(答案|正确答案|正确选项|选项|答)[：:、.．\s]*/g, '');
        // 去掉常见分隔符与连接词后，若全部由选项字母构成，则判定为「字母答案」
        var compact = stripped.replace(/[\s，,、;；和与及以及\/|#\-—]+/g, '').toUpperCase();
        if (compact.length > 0 && /^[A-Z]+$/.test(compact)) {
            var letters = [],
                allValid = true;
            for (var i = 0; i < compact.length; i++) {
                var ch = compact.charAt(i);
                if (valid.indexOf(ch) < 0) {
                    allValid = false;
                    break;
                }
                if (letters.indexOf(ch) < 0) letters.push(ch);
            }
            if (allValid && letters.length > 0) {
                // 单选题只取第一个字母，防止模型多输出了字母
                return qu['type'] === '单选题' ? [letters[0]] : letters;
            }
        }
        // 非字母答案：按 # 或换行切分当作文本处理
        return t.split(/[#\n]/).map(function (s) {
            return s.trim();
        }).filter(function (s) {
            return s !== '';
        });
    };

    // —— 接口地址归一化：兼容用户只填了「基础地址」的情况（自动补 /chat/completions）——
    var normalizeAiUrl = function (u) {
        u = String(u || '').trim().replace(/\/+$/, '');
        if (!u) return u;
        if (/\/chat\/completions$/i.test(u)) return u; // 已完整
        if (/\/v\d+$/i.test(u)) return u + '/chat/completions'; // .../v1 → .../v1/chat/completions
        if (/\/completions$/i.test(u)) return u; // 其它 completions 端点不擅改
        return u + '/chat/completions';
    };

    // —— 调用 AI，回调 (answerArray, errMsg)；answerArray 形如 ['A文本','B文本'] ——
    var askAI = function (qu, callback) {
        if (aiEnable != 1 || !aiKey || !aiUrl) {
            callback(null, 'AI未启用或未配置（请在面板填写 Key 并点「保存」）');
            return;
        }
        var endpoint = normalizeAiUrl(aiUrl);
        var payload = {
            model: aiModel,
            temperature: aiTemperature,
            // 明确要求非流式：避免个别服务/中转默认返回 SSE 流导致 onload 迟迟不触发（表现为超时）
            stream: false,
            messages: [{
                role: 'user',
                content: buildAiPrompt(qu)
            }]
        };
        aiAcquire().then(function () {
            var done = false;
            var finish = function (arr, err) {
                if (done) return;
                done = true;
                aiRelease();
                callback(arr, err);
            };
            var secs = Math.round(aiTimeout / 1000);
            var timer = setTimeout(function () {
                finish(null, 'AI请求超时（' + secs + 's 无响应）：请依次检查 ①本机网络能否打开 ' + endpoint +
                    ' ②接口地址/模型名是否正确 ③密钥是否有效。');
            }, aiTimeout);
            GM_xmlhttpRequest({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + aiKey
                },
                url: endpoint,
                timeout: aiTimeout,
                data: JSON.stringify(payload),
                onload: function (res) {
                    clearTimeout(timer);
                    var raw = (res && res.responseText) || '';
                    // 非 2xx：把状态码与响应片段直接抛给用户，便于自查（如 401 换 Key、404 换地址、429 限流、402 欠费）
                    if (res && res.status && (res.status < 200 || res.status >= 300)) {
                        var hint = {
                            400: '请求参数有误，多半是模型名不对',
                            401: 'API Key 无效或填写有误',
                            402: '账户余额不足',
                            403: '无权限，Key 可能未开通该模型',
                            404: '接口地址错误，检查是否缺 /chat/completions 或模型名不存在',
                            405: '方法不被允许，接口地址填成了页面地址？请检查地址',
                            429: '请求过于频繁已被限流，稍后重试',
                            500: '服务端错误',
                            502: '网关错误',
                            503: '服务暂不可用'
                        }[res.status] || '';
                        finish(null, 'AI接口返回 HTTP ' + res.status + (hint ? '（' + hint + '）' : '') + '：' +
                            raw.replace(/\s+/g, ' ').slice(0, 200));
                        return;
                    }
                    try {
                        var json = JSON.parse(raw);
                        if (!json.choices || !json.choices[0]) {
                            var msg = (json.error && json.error.message) ||
                                ('AI返回格式异常：' + raw.replace(/\s+/g, ' ').slice(0, 200));
                            finish(null, msg);
                            return;
                        }
                        var text = (json.choices[0].message && json.choices[0].message.content || '').trim();
                        // 统一交给 parseAiAnswer 解析（优先还原为选项字母，其次按正文）
                        var arr = parseAiAnswer(qu, text);
                        if (arr.length === 0) {
                            finish(null, 'AI未返回有效答案（原始内容：' + text.replace(/\s+/g, ' ').slice(0, 120) + '）');
                            return;
                        }
                        finish(arr, null);
                    } catch (e) {
                        finish(null, 'AI返回解析失败：' + raw.replace(/\s+/g, ' ').slice(0, 200));
                    }
                },
                onerror: function (err) {
                    clearTimeout(timer);
                    finish(null, 'AI请求失败' + (err && err.error ? '：' + err.error : '') +
                        '（常见原因：本机网络无法访问 ' + endpoint + '，或脚本管理器未放行该域名 @connect）');
                },
                ontimeout: function () {
                    clearTimeout(timer);
                    finish(null, 'AI请求超时（' + secs + 's）：请检查网络与接口地址。');
                }
            });
        });
    };

    // —— 归一化比较：去掉所有空白与常见标点差异，用于选项匹配 ——
    var normText = function (s) {
        return trim(String(s)).replace(/\s/ig, '');
    };

    /* =========================================================================
     * 统一界面设计系统 UI_CSS
     * 三处界面共用：①主面板(knowledge/cards) ②挂机页(unrivalxxtbackground)
     * ③人脸验证页(/visit/stucoursemiddle)。
     * 不再依赖 bootstrap CDN —— 全部内联，断网或 CDN 被拦截也保持同一套观感。
     * 必须定义在顶层作用域，否则互斥分支取不到（历史踩坑：findNextButton）。
     * ========================================================================= */
    var UI_CSS = `:root{--bg:#f5f7fb;--card:#fff;--line:#e5e9f0;--ink:#1f2937;--ink2:#5b6472;--ink3:#8b95a5;--brand:#2f6fed;--brand-soft:#eaf1ff;--ok:#16803c;--ok-soft:#e7f6ec;--warn:#b45309;--warn-soft:#fdf3e3;--danger:#c0392b;--danger-soft:#fdecea;--r:10px;--shadow:0 1px 2px rgba(16,24,40,.04),0 4px 14px rgba(16,24,40,.05)}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1160px;margin:0 auto;padding:26px 20px 44px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:11px}
.brand-mark{width:34px;height:34px;flex:0 0 34px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;letter-spacing:.5px;box-shadow:0 2px 6px rgba(47,111,237,.28)}
.brand h1{margin:0;font-size:18px;font-weight:650;letter-spacing:.2px;line-height:1.3;color:var(--ink)}
.brand-sub{margin-top:2px;font-size:12px;color:var(--ink3)}
.badge{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;background:var(--ok-soft);color:var(--ok);border:1px solid #c9e8d5;font-size:12px;font-weight:600}
.badge i{width:6px;height:6px;border-radius:50%;background:currentColor}
.badge.is-paused{background:var(--warn-soft);color:var(--warn);border-color:#f2ddb6}
.grid{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);gap:16px;align-items:start}
.col{display:flex;flex-direction:column;gap:16px;min-width:0}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.panel-heading{display:flex;align-items:center;gap:9px;padding:12px 16px;background:#fbfcfe;border-bottom:1px solid var(--line);font-size:13.5px;font-weight:650;color:var(--ink)}
.panel-heading::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--brand)}
.panel-body{padding:16px}
.notice{display:block;padding:9px 12px;margin-bottom:14px;border:1px solid #f2ddb6;background:var(--warn-soft);color:#8a5a08;border-radius:8px;font-size:12.5px;line-height:1.55}
.hint{margin-top:6px;font-size:12px;color:var(--ink3);line-height:1.55}
.field{margin-bottom:14px}
.field:last-child{margin-bottom:0}
.label{display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--ink2)}
.ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
input[type=text],input[type=number],select{width:100%;height:36px;padding:0 11px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:var(--ink);font-size:14px;font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(47,111,237,.14)}
input.in-sm{width:104px;flex:0 0 auto}
select{height:38px;cursor:pointer}
.btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 13px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:var(--ink);font-size:13px;font-weight:500;font-family:inherit;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s;user-select:none}
.btn:hover{background:#f6f8fc;border-color:#c6cfdc}
.btn:active{transform:translateY(1px)}
.btn-toggle::before{content:"";width:7px;height:7px;margin-right:7px;border-radius:50%;background:currentColor;opacity:.26;transition:opacity .15s}
.btn-success{background:var(--ok-soft);border-color:#bfe3cb;color:var(--ok);font-weight:600}
.btn-success:hover{background:#dcf0e3;border-color:#a8d9b9}
.btn-toggle.btn-success::before{opacity:1}
.btn-warning{background:var(--warn-soft);border-color:#f0dcb4;color:var(--warn);font-weight:600}
.btn-warning:hover{background:#fae9cf}
.btn-toggle.btn-warning::before{opacity:1}
.btn-primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.btn-primary:hover{background:#255ed4;border-color:#255ed4}
.btn-info{background:var(--brand-soft);border-color:#c9dbff;color:var(--brand);font-weight:600}
.btn-info:hover{background:#dfeaff}
.btnrow{display:flex;flex-wrap:wrap;gap:8px}
.donate{display:flex;gap:16px;align-items:center}
.donate img{width:132px;height:132px;border-radius:10px;border:1px solid var(--line);display:block;flex:0 0 auto}
.donate-text p{margin:0 0 6px;font-size:14px}
.donate-text p.muted{margin:0;color:var(--ink2);font-size:13px}
.joblist{display:flex;flex-direction:column;gap:8px}
.joblist:not(:empty)+.empty{display:none}
.job-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:#fbfcfe;font-size:13px}
.job-status{flex:0 0 auto;padding:2px 8px;border-radius:999px;background:#eef1f6;color:var(--ink2);font-size:11.5px;font-weight:600}
.job-item.is-done{background:var(--ok-soft);border-color:#c9e8d5}
.job-item.is-done .job-status{background:#fff;color:var(--ok)}
.job-item.is-running{background:var(--brand-soft);border-color:#c9dbff}
.job-item.is-running .job-status{background:#fff;color:var(--brand)}
.job-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{padding:8px 0;color:var(--ink3);font-size:13px}
.logbox{height:300px;overflow:auto;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fbfcfe;font-size:12.5px;line-height:1.75}
.log-line{padding:3px 0;border-bottom:1px solid #f0f2f7}
.log-line:last-child{border-bottom:0}
.log-ts{display:inline-block;margin-right:7px;color:var(--ink3);font-variant-numeric:tabular-nums}
.framebox{display:block;width:100%;height:320px;border:0;border-radius:8px;background:#fff}
.framebox.tall{height:920px}
.face-panel{position:fixed;top:14px;right:14px;width:300px;z-index:10000;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.face-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.face-title{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fbfcfe;border-bottom:1px solid var(--line);color:var(--brand);font-size:13px;font-weight:650;cursor:move;user-select:none}
.face-title::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--brand)}
.face-body{padding:14px}
.face-status{min-height:22px;color:var(--ink2);font-size:12.5px;word-break:break-all}
.face-pre{display:none;margin:10px 0 0;padding:9px;max-height:180px;overflow:auto;background:#f7f8fb;border:1px solid var(--line);border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:10001;min-width:240px;max-width:440px;padding:10px 14px;border-radius:9px;border:1px solid var(--line);background:#fff;box-shadow:0 6px 20px rgba(16,24,40,.14);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.toast strong{display:block;margin-bottom:2px;font-size:13px}
.toast-success{background:var(--ok-soft);border-color:#c9e8d5;color:var(--ok)}
.toast-error{background:var(--danger-soft);border-color:#f5c6c2;color:var(--danger)}
.toast-warning{background:var(--warn-soft);border-color:#f0dcb4;color:var(--warn)}
.toast-info{background:var(--brand-soft);border-color:#c9dbff;color:var(--brand)}
@media(max-width:1020px){.grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:640px){.wrap{padding:16px 12px 30px}.grid{gap:12px}.col{gap:12px}.donate{flex-direction:column;align-items:flex-start}.logbox{height:240px}.brand h1{font-size:16px}}`;

    // 组件级样式：只含按钮/面板/浮动面板/toast，不含 html、body、布局类规则。
    // 人脸验证页是超星自己的页面，注入完整 UI_CSS 会把它的 body 背景与字体一起改掉。
    var UI_CSS_WIDGET = `:root{--bg:#f5f7fb;--card:#fff;--line:#e5e9f0;--ink:#1f2937;--ink2:#5b6472;--ink3:#8b95a5;--brand:#2f6fed;--brand-soft:#eaf1ff;--ok:#16803c;--ok-soft:#e7f6ec;--warn:#b45309;--warn-soft:#fdf3e3;--danger:#c0392b;--danger-soft:#fdecea;--r:10px;--shadow:0 1px 2px rgba(16,24,40,.04),0 4px 14px rgba(16,24,40,.05)}
.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.panel-heading{display:flex;align-items:center;gap:9px;padding:12px 16px;background:#fbfcfe;border-bottom:1px solid var(--line);font-size:13.5px;font-weight:650;color:var(--ink)}
.panel-heading::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--brand)}
.panel-body{padding:16px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 13px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:var(--ink);font-size:13px;font-weight:500;font-family:inherit;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s;user-select:none}
.btn:hover{background:#f6f8fc;border-color:#c6cfdc}
.btn:active{transform:translateY(1px)}
.btn-toggle::before{content:"";width:7px;height:7px;margin-right:7px;border-radius:50%;background:currentColor;opacity:.26;transition:opacity .15s}
.btn-success{background:var(--ok-soft);border-color:#bfe3cb;color:var(--ok);font-weight:600}
.btn-success:hover{background:#dcf0e3;border-color:#a8d9b9}
.btn-toggle.btn-success::before{opacity:1}
.btn-warning{background:var(--warn-soft);border-color:#f0dcb4;color:var(--warn);font-weight:600}
.btn-warning:hover{background:#fae9cf}
.btn-toggle.btn-warning::before{opacity:1}
.btn-primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.btn-primary:hover{background:#255ed4;border-color:#255ed4}
.btn-info{background:var(--brand-soft);border-color:#c9dbff;color:var(--brand);font-weight:600}
.btn-info:hover{background:#dfeaff}
.btnrow{display:flex;flex-wrap:wrap;gap:8px}
.face-panel{position:fixed;top:14px;right:14px;width:300px;z-index:10000;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.face-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden}
.face-title{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fbfcfe;border-bottom:1px solid var(--line);color:var(--brand);font-size:13px;font-weight:650;cursor:move;user-select:none}
.face-title::before{content:"";width:3px;height:13px;border-radius:2px;background:var(--brand)}
.face-body{padding:14px}
.face-status{min-height:22px;color:var(--ink2);font-size:12.5px;word-break:break-all}
.face-pre{display:none;margin:10px 0 0;padding:9px;max-height:180px;overflow:auto;background:#f7f8fb;border:1px solid var(--line);border-radius:8px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:10001;min-width:240px;max-width:440px;padding:10px 14px;border-radius:9px;border:1px solid var(--line);background:#fff;box-shadow:0 6px 20px rgba(16,24,40,.14);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.toast strong{display:block;margin-bottom:2px;font-size:13px}
.toast-success{background:var(--ok-soft);border-color:#c9e8d5;color:var(--ok)}
.toast-error{background:var(--danger-soft);border-color:#f5c6c2;color:var(--danger)}
.toast-warning{background:var(--warn-soft);border-color:#f0dcb4;color:var(--warn)}
.toast-info{background:var(--brand-soft);border-color:#c9dbff;color:var(--brand)}`;    // —— 开关按钮的视觉状态：on=成功色，warn=警告色（暂停），否则默认色 ——
    // 定义在顶层：htmlHook 与 readyCheck 都要用，放进任一分支内部另一处就取不到。
    var setToggleUI = function (btn, on, warn) {
        if (!btn) return;
        btn.setAttribute('class',
            'btn btn-toggle ' + (on ? (warn ? 'btn-warning' : 'btn-success') : 'btn-default'));
    };
    // —— 顶栏状态徽章：与暂停状态联动 ——
    var syncRunBadge = function () {
        var paused = String(_w.top.unrivalPaused) === '1';
        var badge = _d.getElementById('runBadge');
        if (badge) {
            badge.setAttribute('class', 'badge' + (paused ? ' is-paused' : ''));
            badge.innerHTML = '<i></i>' + (paused ? '已暂停' : '运行中');
        }
        return paused;
    };
    /* =========================================================================
     * ⚠ 以下「下一节」相关工具函数必须定义在【顶层作用域】。
     * 本脚本按 URL 分成多个互斥分支（knowledge/cards 分支、mycourse/studentstudy
     * 分支…），同一时刻只有一个分支会执行。若把这些函数放在某个分支内部，另一
     * 分支调用时它就是 undefined，抛出的异常还会被 try/catch 静默吞掉 ——
     * 表现为「不能自动切换下一节」却看不到任何报错。
     * ========================================================================= */
    // 元素是否可见（超星在最后一节只是把按钮 display:none，元素仍在 DOM 里，
    // 只看「元素是否存在」会误判，必须看 display）
    var isVisible = function (el) {
        if (!el) return false;
        try {
            var inline = (el.getAttribute('style') || '').replace(/\s/g, '');
            if (inline.indexOf('display:none') >= 0) return false;
            if (inline.indexOf('visibility:hidden') >= 0) return false;
            var cs = _w.getComputedStyle ? _w.getComputedStyle(el) : null;
            if (cs) {
                if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            }
        } catch (e) { }
        return true;
    };
    // 查找可点的「下一节/下一章」按钮，返回元素本身（找不到返回 null），供点击复用。
    // 关键修正：不再依赖 URL 的 mooc2 参数二选一。mooc2 参数经常缺失，
    // 一旦缺失就会跑去旧版分支找 .orientationright，在新版页面上必然找不到 → 误报最后一章。
    // 这里新旧版都查，且优先用最稳定的 id。
    var findNextButton = function () {
        var sels = [
            '#prevNextFocusNext',                            // 新版「下一节」按钮（最稳定）
            '.jb_btn.jb_btn_92.fs14.prev_next.next',         // 新版 class 组合
            '.prev_next.next',
            '.orientationright'                              // 旧版
        ];
        for (var i = 0; i < sels.length; i++) {
            try {
                var el = _d.querySelector(sels[i]);
                if (el && isVisible(el)) return el;
            } catch (e) { }
        }
        // 兜底①：按 class 全量扫，避免 class 顺序/多余 class 导致 querySelector 失配
        try {
            var all = _d.getElementsByClassName('prev_next');
            for (var j = 0; j < all.length; j++) {
                var t = (all[j].textContent || all[j].innerText || '').replace(/\s/g, '');
                if (isVisible(all[j]) && (t.indexOf('下一节') >= 0 || t.indexOf('下一章') >= 0)) {
                    return all[j];
                }
            }
        } catch (e) { }
        // 兜底②：新版「下一节」是 div，靠 onclick="PCount.next(...)" 触发，
        // 上面按 class 找可能漏掉，这里直接按 onclick 内容找
        try {
            var allEl = _d.getElementsByTagName('*');
            for (var m = 0; m < allEl.length; m++) {
                var el2 = allEl[m];
                var oc = el2.getAttribute && el2.getAttribute('onclick');
                if (oc && oc.indexOf('PCount.next') >= 0 && isVisible(el2)) return el2;
            }
        } catch (e) { }
        // 兜底③：全页面按可见文字找「下一节 / 下一章」
        try {
            var allEl2 = _d.getElementsByTagName('*');
            for (var n2 = 0; n2 < allEl2.length; n2++) {
                var el3 = allEl2[n2];
                if (!isVisible(el3)) continue;
                var txt = (el3.textContent || el3.innerText || '').replace(/\s/g, '');
                if (txt === '下一节' || txt === '下一章') return el3;
            }
        } catch (e) { }
        return null;
    };
    /* 跨分支安全日志。
     * logs 定义在 knowledge/cards 分支里，且 addLog 依赖面板上的 #log 元素；
     * 而 mycourse/studentstudy 分支（真正执行「跳转下一节」的页面）两者都没有，
     * 直接调用 logs.addLog 会抛异常。这里做降级：面板存在写面板，否则写控制台。 */
    var safeLog = function (str, color) {
        try {
            if (typeof logs !== 'undefined' && logs && logs.addLog && _d.getElementById('log')) {
                logs.addLog(str, color || 'black');
                return;
            }
        } catch (e) { }
        try {
            console.log('[学习通助手] ' + String(str).replace(/<[^>]+>/g, ''));
        } catch (e) { }
    };
    // 目录里的小节总数（用于判断「已绕回一圈」）
    var countSections = function () {
        var n = 0;
        try {
            var tabs = _d.getElementsByClassName('posCatalog_select');
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].id && tabs[i].id.indexOf('cur') >= 0) n++;
            }
            if (n === 0) {
                var spans = _d.getElementsByTagName('span');
                for (var j = 0; j < spans.length; j++) {
                    var st = spans[j].getAttribute('style');
                    if (st && st.indexOf('cursor:pointer;height:18px;') >= 0) n++;
                }
            }
        } catch (e) { }
        return n;
    };
    if (parseFloat(rate) == parseInt(rate)) {
        rate = parseInt(rate);
    } else {
        rate = parseFloat(rate);
    }
    try {
        _w.top.unrivalReviewMode = GM_getValue('unrivalreview', '0') || '0';
        _w.top.unrivalDoWork = GM_getValue('unrivaldowork', '1') || '1';
        _w.top.unrivalAutoSubmit = GM_getValue('unrivalautosubmit', '1') || '1';
        _w.top.unrivalAutoSave = GM_getValue('unrivalautosave', '0') || '0';
        // 全局暂停开关：'1' 时脚本停止一切自动化动作（答题/刷视频/提交），刷新后仍保留
        _w.top.unrivalPaused = GM_getValue('unrivalpaused', '0') || '0';
    } catch (e) { }
    if (_l.href.indexOf("knowledge/cards") > 0) {
        let allowBackground = false,
            spans = _d.getElementsByTagName('span');
        for (let i = 0, l = spans.length; i < l; i++) {
            if (spans[i].innerHTML.indexOf('章节未开放') != -1) {
                if (_l.href.indexOf("ut=s") != -1) {
                    _l.href = _l.href.replace("ut=s", "ut=t").replace(/&cpi=[0-9]{1,10}/, '');
                } else if (_l.href.indexOf("ut=t") != -1) {
                    spans[i].innerHTML = '此课程为闯关模式，请回到上一章节完成学习任务！'
                    return;
                }
                break;
            }
        }
        _w.top.unrivalPageRd = String(Math.random());
        if (!isFf) {
            try {
                cVersion = parseInt(navigator.userAgent.match(/Chrome\/[0-9]{2,3}./)[0].replace('Chrome/', '')
                    .replace('.', ''));
            } catch (e) { }
        }
        var busyThread = 0,
            getStr = (str, start, end) => {
                let res = str.substring(str.indexOf(start), str.indexOf(end)).replace(start, '');
                return res;
            },
            scripts = _d.getElementsByTagName('script'),
            param = null;
        for (let i = 0, l = scripts.length; i < l; i++) {
            if (scripts[i].innerHTML.indexOf('mArg = "";') != -1 && scripts[i].innerHTML.indexOf(
                '==UserScript==') == -1) {
                param = getStr(scripts[i].innerHTML, 'try{\n    mArg = ', ';\n}catch(e){');
            }
        }
        if (param == null) {
            return;
        }
        try {
            vrefer = _d.getElementsByClassName('ans-attach-online ans-insertvideo-online')[0].src;
        } catch (e) {
            vrefer = _p + '//' + _h + '/ananas/modules/video/index.html?v=2022-1118-1729';
        }
        GM_setValue('vrefer', vrefer);
        GM_setValue('host', _h);
        // AI 兜底配置已在顶层作用域统一读取，此处无需重复（见文件前部）
        var base222 = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoCAMAAABNO5HnAAADAFBMVEX+/v4BAQHPlzTRmYzWpZQxJRdGOCk6NCvo5+ctKSXQuKsXFxbX1tWyh3GumYvIx8fYxLG4trPNmHKXlpQoGw5XVlWKiIePZ01JR0aqqKevd2lqZ2dQRDZ4dnXjxa9sWEvGiHKxpJeOeGy4k3nXqqXUpW3kt6vXtZXnxpR0ZVfLmUyHWjfhp5TkuYzhrKNqSDOtd1RGKhfKjIKLWUqVdFmmalmriJHSo1aThXjs1qz06M12UzaVeIiSZDi0hlHLhy23mKzZtHSJaWzjtXROMxupbGKudjbip0vl2c389NjiojtELCNqTEbgnDY6MR7iqW9zWWdmOijlxsHZw5LFnajz5Lm5gjjCe3GsjKSJRzGmfYpjNxngm3ejWlPp05lxRhzGiFThnY+RTUTCfiqhazyOOSq7dhrisFqMboLUvcLe4d59e4Hf05t+gH2CXWnkvcFeYV2foZ3DfFs+QD2/o1e+wb3qwXp+gIHAex3foTp8cVze0L3e4eBeUDw+QUG+mjw+PUAcHiDasFbGgB+/wMC8sZ++m1CfoaOfnqGYgE+ecDiXbR3f3uBlLh5fZmFdX2BZO0tBHwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABw9DvpAAABAHRSTlP+/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaz57ZQAARmpJREFUeNrtnYdj29bV6KWQIgASJARBAAGCEChqUpZFbVHDbqxISVz7c5w4aZo0adp0t9/e873v7b3+43fOvRf7AgQoipJl3ja2tsUfD889+8zMTM/0TM/0TM/0TM/0TM/0TM/0TM/0TM/0TM/0TM/0TM/0TM/0TM+DO5Zta2LaJ8XMz05PgePMwnHSPmvgZ+0ppZsfUUKUNTnlswL5rDLldOOjzpJj8T8rS1PQxeRWHALaSPm0jp8UxOI/9508si0Itpgls7N6yrcqoDskKw2zIwj6VNpjYmln6ehU0DOiqsqZN6UwFWpfaGsZipaBNkf5wfSmVKeEvZd/LUsNE3GfleQRFD8BPTsFnU8N27NZ9t1wE3yqOnIKLQM9yp0m2oJkTgU6dmml2cpapiE9stn4bjolWUo622MRZXnKr+itxVfSVhZo1ZSmlnKBl7GdoaSzbBJ6jTozU7US4qULgiOOoKSZuDvpamUkG1s0TEF/gBelbGbJHpNa/qfJd85qYwZNnltJeaD3nSlmKmkz3ezgqxX6fcbotrv2joHONpY100x7kSu2YDri6BblwwMtC5nXlpX5uLOurdGuNPYSeohxEFWXBFseEu7QJ+wi6Q/S8JCzHhW98QR5otGVdzGw50z0kTO3Xp95Z1OD2gQvjFHjJw85VHo7Am3OzExDpXmtB1kc2eR42AItK3KWHVAwvq9JNam4Ga09ZJPDi8SnkqEejVTowdPvKarXRfOhOitxWdLSnUNnBGvYHk2ghbc6kC1quunIQ8Kh/CyeaOi6IY4A2hlNQ2vpcb3Cv8gdmcPpys8Z7y2kSCP8NObtp4ZdqDTYb0OqJD2ROvRBFvbrTbuoqqUaumZlP3v3XLEMq6QY/z0kjugZpT/XNOwiyW+BNZzxS979RWRmF016wmDecyWtmLWaYA03re7MV2DKK0tgVQEew70PN4mKKuZ4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`;
        _d.getElementsByTagName("html")[0].innerHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>学习通小助手</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${UI_CSS}</style>
    </head>
    <body>
        <div class="wrap">
            <div class="topbar">
                <div class="brand">
                    <span class="brand-mark">学</span>
                    <div>
                        <h1>超星学习通小助手</h1>
                        <div class="brand-sub">AI 答题 · 自动挂机 · 人脸验证</div>
                    </div>
                </div>
                <span class="badge" id="runBadge"><i></i>运行中</span>
            </div>

            <div class="grid">
                <div class="col">
                    <div class="panel" id="remarks">
                        <div class="panel-heading">作者留言</div>
                        <div class="panel-body">
                            <div class="donate">
                                <img src="`+ base222 + `" alt="赞赏码">
                                <div class="donate-text">
                                    <p>作者是 xuchao3328，目前在读大二</p>
                                    <p class="muted">放个赞赏码，如果觉得好用的话，欢迎赞助</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="panel" id="normalQuery">
                        <div class="panel-heading">任务配置</div>
                        <div class="panel-body">
                            <div class="notice">高倍速是会清进度的，建议一倍速运行，除非是真的没时间了才调高倍数</div>

                            <div class="field">
                                <label class="label" for="unrivalRate">视频倍速</label>
                                <div class="ctrl">
                                    <input type="number" id="unrivalRate" class="in-sm">
                                    <a id="updateRateButton" class="btn btn-primary">保存</a>
                                </div>
                            </div>

                            <div class="field">
                                <span class="label">章节测试</span>
                                <div class="btnrow">
                                    <a id="autoDoWorkButton" class="btn btn-default btn-toggle">自动答题</a>
                                    <a id="autoSubmitButton" class="btn btn-default btn-toggle">自动提交</a>
                                    <a id="autoSaveButton" class="btn btn-default btn-toggle">自动保存</a>
                                    <a id="reviewModeButton" class="btn btn-default btn-toggle">复习模式</a>
                                </div>
                            </div>

                            <div class="field">
                                <label class="label" for="accuracy">章节测试正确率（%）</label>
                                <div class="ctrl">
                                    <input type="number" id="accuracy" class="in-sm">
                                    <a id="updateaccuracy" class="btn btn-primary">保存</a>
                                </div>
                                <div class="hint">在答题正确率在规定之上并且允许自动提交时才会提交答案</div>
                            </div>

                            <div class="field">
                                <span class="label">全局控制</span>
                                <div class="btnrow">
                                    <a id="pauseButton" class="btn btn-default btn-toggle" title="一键暂停/继续脚本的全部自动化动作">暂停运行</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="panel" id="tikupeizhi">
                        <div class="panel-heading">AI 答题配置</div>
                        <div class="panel-body">
                            <div class="field">
                                <label class="label" for="aiPreset">选择模型（选中后自动保存）</label>
                                <select id="aiPreset">
`+ aiPresets.map(function (p) {
        return '<option value="' + p.model + '||' + p.url + '">' + p.name + '</option>';
    }).join('') +`
                                </select>
                            </div>
                            <div class="field">
                                <label class="label" for="aiUrl">接口地址</label>
                                <input type="text" id="aiUrl" value="`+aiUrl+`">
                            </div>
                            <div class="field">
                                <label class="label" for="aiModel">模型名</label>
                                <input type="text" id="aiModel" value="`+aiModel+`">
                            </div>
                            <div class="field">
                                <label class="label" for="aiKey">密钥（Key）</label>
                                <input type="text" id="aiKey" value="`+aiKey+`">
                            </div>
                            <div class="hint">提示：地址可只填到 /v1，脚本会自动补 /chat/completions。</div>
                            <div class="btnrow" style="margin-top:12px">
                                <a id="updateAiConfig" class="btn btn-primary">保存</a>
                                <a id="testAiButton" class="btn btn-info">测试连接</a>
                            </div>
                        </div>
                    </div>

                    <div class="panel" id="videoTime" style="display: none;">
                        <div class="panel-heading">学习进度</div>
                        <div class="panel-body">
                            <iframe id="videoTimeContent" src="" class="framebox"></iframe>
                        </div>
                    </div>
                </div>

                <div class="col">
                    <div class="panel">
                        <div class="panel-heading">任务列表</div>
                        <div class="panel-body">
                            <div id="joblist" class="joblist"></div>
                            <div class="empty">暂无任务</div>
                        </div>
                    </div>
                    <div class="panel">
                        <div class="panel-heading">运行日志</div>
                        <div class="panel-body">
                            <div id="result" class="logbox"><div id="log"></div></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="panel" id="workPanel" style="display: none;margin-top: 16px;">
                <div class="panel-heading">章节测试</div>
                <div class="panel-body" id="workWindow">
                    <iframe id="frame_content" name="frame_content" src="" class="framebox tall"></iframe>
                </div>
            </div>
        </div>
    </body>
</html>
`;
        var logs = {
            "logArry": [],
            "addLog": function (str, color = "black") {
                if (this.logArry.length >= 50) {
                    this.logArry.splice(0, 1);
                }
                var nowTime = new Date();
                var nowHour = (Array(2).join(0) + nowTime.getHours()).slice(-2);
                var nowMin = (Array(2).join(0) + nowTime.getMinutes()).slice(-2);
                var nowSec = (Array(2).join(0) + nowTime.getSeconds()).slice(-2);
                // 结构化日志行：时间戳走次要色（.log-ts），正文沿用语义色
                this.logArry.push("<div class='log-line' style='color: " + color + "'>" +
                    "<span class='log-ts'>[" + nowHour + ":" + nowMin + ":" + nowSec + "]</span>" +
                    str + "</div>");
                var logElement = _d.getElementById('log');
                if (!logElement) return;
                logElement.innerHTML = this.logArry.join('');
                // 滚动容器是外层 #result(.logbox)，内层 #log 不滚动。
                // 若对 #log 设 scrollTop 恒为 0 —— 日志不会自动跟随到底部（历史 bug）。
                var box = _d.getElementById('result') || logElement;
                box.scrollTop = box.scrollHeight;
            }
        },
            htmlHook = setInterval(function () {
                if (_d.getElementById('unrivalRate') && _d.getElementById('updateRateButton') && _d
                    .getElementById('reviewModeButton') && _d.getElementById('autoDoWorkButton') && _d
                        .getElementById('autoSubmitButton') && _d.getElementById('autoSaveButton')) {
                    // 检测「超星挂机小助手」是否在运行（与面板按钮无关，供后台挂机逻辑使用）
                    allowBackground = Math.round(new Date() / 1000) - parseInt(GM_getValue(
                        'unrivalBackgroundVideoEnable',
                        '6')) < 15;
                    clearInterval(htmlHook);
                    if (cVersion < 86) {
                        logs.addLog(
                            '\u60a8\u7684\u6d4f\u89c8\u5668\u5185\u6838\u8fc7\u8001\uff0c\u8bf7\u66f4\u65b0\u7248\u672c\u6216\u4f7f\u7528\u4e3b\u6d41\u6d4f\u89c8\u5668\uff0c\u63a8\u8350\u003c\u0061\u0020\u0068\u0072\u0065\u0066\u003d\u0022\u0068\u0074\u0074\u0070\u0073\u003a\u002f\u002f\u0077\u0077\u0077\u002e\u006d\u0069\u0063\u0072\u006f\u0073\u006f\u0066\u0074\u002e\u0063\u006f\u006d\u002f\u007a\u0068\u002d\u0063\u006e\u002f\u0065\u0064\u0067\u0065\u0022\u0020\u0074\u0061\u0072\u0067\u0065\u0074\u003d\u0022\u0076\u0069\u0065\u0077\u005f\u0077\u0069\u006e\u0064\u006f\u0077\u0022\u003e\u0065\u0064\u0067\u0065\u6d4f\u89c8\u5668\u003c\u002f\u0061\u003e',
                            'red');
                        stop = true;
                        return;
                    }
                    if (isMobile) {
                        logs.addLog('手机浏览器不保证能正常运行此脚本', 'orange');
                    }


                    // —— 题库已移除：答题全部走 AI，故不再需要题库 Token ——

                    // —— 把当前面板内容写入存储（下拉切换与「保存」按钮共用）——
                    function persistAiConfig() {
                        // 地址归一化后回写到输入框，用户能直接看到被修正的结果
                        var rawUrl = _d.getElementById('aiUrl').value.trim() || aiUrl;
                        aiUrl = normalizeAiUrl(rawUrl);
                        _d.getElementById('aiUrl').value = aiUrl;
                        aiModel = _d.getElementById('aiModel').value.trim() || aiModel;
                        aiKey = _d.getElementById('aiKey').value.trim();
                        // 并发与超时已固定，不再从面板读取
                        try {
                            GM_setValue('aiUrl', aiUrl);
                            GM_setValue('aiModel', aiModel);
                            GM_setValue('aiKey', aiKey);
                            return true;
                        } catch (e) {
                            return false;
                        }
                    }

                    // —— 选择预设模型：自动填充地址与模型名，并立即保存 ——
                    (function () {
                        var presetSel = _d.getElementById('aiPreset');
                        if (!presetSel) return;
                        // 初始选中与当前配置匹配的预设
                        for (var pi = 0; pi < presetSel.options.length; pi++) {
                            var pv = presetSel.options[pi].value.split('||');
                            if (pv[0] === aiModel && pv[1] === aiUrl) {
                                presetSel.selectedIndex = pi;
                                break;
                            }
                        }
                        presetSel.onchange = function () {
                            var v = presetSel.value.split('||');
                            var m = v[0], u = v[1];
                            if (!u && !m) return; // 「自定义」不清空已有输入
                            _d.getElementById('aiModel').value = m;
                            _d.getElementById('aiUrl').value = u;
                            // 关键：切换后立即落盘，避免刷新丢失
                            if (persistAiConfig()) {
                                logs.addLog('已切换并保存模型：' + m, 'green');
                            } else {
                                logs.addLog('模型切换后保存失败，请手动点「保存」', 'red');
                            }
                        };
                    })();

                    var _aiSaveBtn = _d.getElementById('updateAiConfig');
                    if (_aiSaveBtn) {
                        _aiSaveBtn.onclick = function () {
                            if (persistAiConfig()) {
                                logs.addLog('AI配置已保存：' + aiModel, 'green');
                            } else {
                                logs.addLog('AI配置保存失败', 'red');
                            }
                        };
                    }

                    // —— AI 连接测试 ——
                    var _aiTestBtn = _d.getElementById('testAiButton');
                    if (_aiTestBtn) {
                    _aiTestBtn.onclick = function () {
                        aiUrl = normalizeAiUrl(_d.getElementById('aiUrl').value.trim() || aiUrl);
                        _d.getElementById('aiUrl').value = aiUrl;
                        aiModel = _d.getElementById('aiModel').value.trim() || aiModel;
                        aiKey = _d.getElementById('aiKey').value.trim();
                        if (!aiKey) {
                            logs.addLog('请先填写 AI 密钥(Key)', 'orange');
                            return;
                        }
                        logs.addLog('正在测试 AI 连接：' + aiModel + ' @ ' + aiUrl, 'blue');
                        askAI({
                            question: '1+1等于几？',
                            type: '单选题',
                            questionid: 'test',
                            options: { length: 0 }
                        }, function (answers, err) {
                            if (answers) {
                                logs.addLog('AI连接成功，返回：' + answers.join('#'), 'green');
                            } else {
                                logs.addLog('AI连接失败：' + (err || '未知错误'), 'red');
                            }
                        });
                    };
                    }

                     _d.getElementById('accuracy').value=accuracy;
                    _d.getElementById('updateaccuracy').onclick = function () {
                        var uaccuracy = _d.getElementById('accuracy').value;
                        if (parseFloat(uaccuracy) == parseInt(uaccuracy)) {
                            uaccuracy = parseInt(uaccuracy);
                        } else {
                            uaccuracy = parseFloat(uaccuracy);
                        }
                        GM_setValue('accuracy', uaccuracy);
                        accuracy = uaccuracy;
                         if (uaccuracy >= 0 && uaccuracy<=100) {
                            logs.addLog('章节测试正确率已更新为'+uaccuracy+'%，将在3秒内生效', 'green');
                        } else {
                            logs.addLog('奇怪正确率', 'orange');
                        }



                    }

                    _d.getElementById('unrivalRate').value = rate;
                    _d.getElementById('updateRateButton').onclick = function () {
                        let urate = _d.getElementById('unrivalRate').value;
                        if (parseFloat(urate) == parseInt(urate)) {
                            urate = parseInt(urate);
                        } else {
                            urate = parseFloat(urate);
                        }
                        GM_setValue('unrivalrate', urate);
                        rate = urate;
                        if (urate > 0) {
                            logs.addLog('视频倍速已更新为' + urate + '倍，将在3秒内生效', 'green');
                        } else {
                            logs.addLog('奇怪的倍速，将会自动跳过视频任务', 'orange');
                        }
                    }
                    // 挂机已默认自动激活（原「激活挂机」按钮已移除）
                    _w.top.backNow = 1;
                    /* —— 开关按钮：状态以 _w.top.* 为准，class 只负责呈现 ——
                     * 旧写法用 getAttribute('class') == 'btn btn-default' 判断是否开启，
                     * 只要给按钮追加任何辅助 class（如 btn-toggle）判断就失效、按钮点不动。
                     * 这里改为读取语义状态，视觉 class 单独维护；并在绑定时以真实状态
                     * 初始化，修复「刷新后按钮显示关闭、实际却是开启」的显示错位。
                     */
                    var bindToggle = function (id, topKey, gmKey, onMsg, offMsg) {
                        var btn = _d.getElementById(id);
                        if (!btn) return;
                        var on = String(_w.top[topKey]) === '1';
                        setToggleUI(btn, on);
                        btn.onclick = function () {
                            on = !on;
                            _w.top[topKey] = on ? '1' : '0';
                            GM_setValue(gmKey, on ? '1' : '0');
                            setToggleUI(btn, on);
                            logs.addLog(on ? onMsg : offMsg, 'green');
                        };
                    };
                    bindToggle('reviewModeButton', 'unrivalReviewMode', 'unrivalreview',
                        '复习模式已开启，遇到已完成的视频任务不会跳过',
                        '复习模式已关闭，遇到已完成的视频任务会自动跳过');
                    bindToggle('autoDoWorkButton', 'unrivalDoWork', 'unrivaldowork',
                        '自动做章节测试已开启，将会自动做章节测试',
                        '自动做章节测试已关闭，将不会自动做章节测试');
                    bindToggle('autoSubmitButton', 'unrivalAutoSubmit', 'unrivalautosubmit',
                        '符合提交标准的章节测试将会自动提交',
                        '章节测试将不会自动提交');
                    bindToggle('autoSaveButton', 'unrivalAutoSave', 'unrivalautosave',
                        '不符合提交标准的章节测试将会自动保存',
                        '不符合提交标准的章节测试将不会自动保存，等待用户自己操作');

                    // —— 暂停/继续：状态走 .btn-warning，并与顶栏状态徽章联动 ——
                    (function () {
                        var pauseButton = _d.getElementById('pauseButton');
                        if (!pauseButton) return;
                        var syncPause = function () {
                            var paused = String(_w.top.unrivalPaused) === '1';
                            setToggleUI(pauseButton, paused, true);
                            pauseButton.innerHTML = paused ? '继续运行' : '暂停运行';
                            syncRunBadge();
                        };
                        syncPause();
                        pauseButton.onclick = function () {
                            var paused = String(_w.top.unrivalPaused) !== '1';
                            _w.top.unrivalPaused = paused ? '1' : '0';
                            GM_setValue('unrivalpaused', _w.top.unrivalPaused);
                            syncPause();
                            logs.addLog(paused ?
                                '⏸ 已暂停：停止答题、刷视频与自动提交，点击「继续运行」恢复' :
                                '▶ 已继续运行', paused ? 'orange' : 'green');
                        };
                    })();
                }
            }, 100),
            loopjob = () => {
                if (_w.top.unrivalScriptList.length > 1) {
                    logs.addLog('您同时开启了多个刷课脚本，会挂科，会挂科，会挂科，会挂科，会挂科，会挂科，会挂科，会挂科', 'red');
                }
                if (cVersion < 8.6 * 10) {
                    logs.addLog(
                        '\u60a8\u7684\u6d4f\u89c8\u5668\u5185\u6838\u8fc7\u8001\uff0c\u8bf7\u66f4\u65b0\u7248\u672c\u6216\u4f7f\u7528\u4e3b\u6d41\u6d4f\u89c8\u5668\uff0c\u63a8\u8350\u003c\u0061\u0020\u0068\u0072\u0065\u0066\u003d\u0022\u0068\u0074\u0074\u0070\u0073\u003a\u002f\u002f\u0077\u0077\u0077\u002e\u006d\u0069\u0063\u0072\u006f\u0073\u006f\u0066\u0074\u002e\u0063\u006f\u006d\u002f\u007a\u0068\u002d\u0063\u006e\u002f\u0065\u0064\u0067\u0065\u0022\u0020\u0074\u0061\u0072\u0067\u0065\u0074\u003d\u0022\u0076\u0069\u0065\u0077\u005f\u0077\u0069\u006e\u0064\u006f\u0077\u0022\u003e\u0065\u0064\u0067\u0065\u6d4f\u89c8\u5668\u003c\u002f\u0061\u003e',
                        'red');
                    stop = true;
                    return;
                }
                if (stop) {
                    return;
                }
                // 暂停中：不派发任何新任务，但保持循环以便恢复
                if (_w.top.unrivalPaused == '1') {
                    setTimeout(loopjob, 1000);
                    return;
                }
                let missionli = missionList;
                if (missionli == []) {
                    setTimeout(loopjob, 500);
                    return;
                }
                for (let itemName in missionli) {
                    if (missionli[itemName]['running']) {
                        setTimeout(loopjob, 500);
                        return;
                    }
                }
                for (let itemName in missionli) {
                    if (!missionli[itemName]['done']) {
                        switch (missionli[itemName]['type']) {
                            case 'video':
                                doVideo(missionli[itemName]);
                                break;
                            case 'document':
                                doDocument(missionli[itemName]);
                                break;
                            case 'work':
                                doWork(missionli[itemName]);
                                break;
                        }
                        setTimeout(loopjob, 500);
                        return;
                    }
                }
                if (busyThread <= 0) {
                    if (jumpType != 2) {
                        requestJumpNext('所有任务处理完毕');
                        logs.addLog('所有任务处理完毕，准备自动下一章', 'green');
                    } else {
                        logs.addLog('所有任务处理完毕，用户设置为不跳转，脚本已结束运行，如需自动跳转，请编辑脚本代码参数', 'green');
                    }
                    clearInterval(loopjob);
                } else {
                    setTimeout(loopjob, 500);
                }
            },
            readyCheck = () => {
                setTimeout(function () {
                    try {
                        if (!isCat) {
                            logs.addLog('当前非脚本猫环境，如遇功能异常可尝试更换脚本管理器', 'orange');
                        }
                        var btnState = [
                            ['reviewModeButton', 'unrivalReviewMode'],
                            ['autoDoWorkButton', 'unrivalDoWork'],
                            ['autoSubmitButton', 'unrivalAutoSubmit'],
                            ['autoSaveButton', 'unrivalAutoSave']
                        ];
                        for (var bi = 0; bi < btnState.length; bi++) {
                            setToggleUI(_d.getElementById(btnState[bi][0]),
                                String(_w.top[btnState[bi][1]]) === '1');
                        }
                        if (_w.top.unrivalReviewMode == '1') {
                            logs.addLog('复习模式已开启，遇到已完成的视频任务不会跳过', 'green');
                        }
                        if (_w.top.unrivalDoWork == '1') {
                            logs.addLog('自动做章节测试已开启，将会自动做章节测试', 'green');
                        }
                        // 恢复暂停按钮状态（刷新后仍生效）
                        let pauseBtn = _d.getElementById('pauseButton');
                        if (pauseBtn) {
                            let paused = syncRunBadge();
                            setToggleUI(pauseBtn, paused, true);
                            pauseBtn.innerHTML = paused ? '继续运行' : '暂停运行';
                            if (paused) {
                                logs.addLog('⏸ 脚本当前处于暂停状态，点击「继续运行」恢复', 'orange');
                            }
                        }
                    } catch (e) {
                        console.log(e);
                        readyCheck();
                        return;
                    }
                }, 500);
            }

        // —— 防打转守卫：修复「做到最后一章不停打转」——
        // 原因：最后一节的「下一章」按钮会让页面绕回/重载，脚本在新页面重新判定“全部完成”，
        // 再次触发跳转 → 无限循环。本守卫把每次发起跳转的小节记录下来（GM 存储 + sessionStorage
        // 会话令牌，跨页面导航仍有效），同一小节第二次发起跳转即判定已成环，立即停止。
        //
        // ⚠ 关键修正（两处）：
        // ① URL 里的 knowledgeid 是「章」的 id，同一章下多个「小节」共用同一个 knowledgeid。
        //    若只用 knowledgeid 做键，正常推进时会误判成“同一小节又跳了一次”，从而谎报“已到最后一章”。
        //    因此改用「章 id + 当前激活小节 id」复合指纹。
        // ② 更根本的问题：超星点最后一节的「下一节」会把页面**绕回开头**，而不是停在最后一节。
        //    于是脚本在开头的页面上再次判定“全部完成”并发起跳转，而开头那一节此前已跳转过 →
        //    旧逻辑据此判定“成环”，谎报“已到最后一章”。
        //    所以「某个小节之前跳转过」根本不等于「现在是最后一章」。
        //    真正的“最后一章”只能靠「页面上还有没有可点的下一节按钮」来判定；
        //    hist 只用来兜底防死循环，且放宽到连续 3 次才停。
        var jumpCount = 0; // 本次会话累计发起跳转的次数（用于识别“已绕回一整圈”）
        var getSectionFingerprint = function () {
            // 1) 章节 id（URL 或 param 解出的 chapterId / knowledgeid）
            var chap = getQueryVariable('knowledgeid') || getQueryVariable('knowledgeId') || '';
            // 2) 当前激活的小节 id：不同小节这个值一定不同，是区分同一章内小节的可靠信号
            var sec = '';
            var tries = [
                '.posCatalog_select.posCatalog_active',
                '.posCatalog_active',
                '.posCatalog_select[class*="posCatalog_active"]',
                'li.currents',
                '.currents'
            ];
            for (var i = 0; i < tries.length && !sec; i++) {
                try {
                    var el = _d.querySelector(tries[i]);
                    if (el) sec = el.id || el.getAttribute('chapterid') ||
                        el.getAttribute('chapterId') || (el.textContent || '').trim().slice(0, 40);
                } catch (e) { }
            }
            // 3) 兜底：页面里标记当前小节的其它常见标记
            if (!sec) {
                try {
                    var span = _d.querySelector('.tabtags .currents') ||
                        _d.querySelector('span.currents');
                    if (span) sec = span.id || (span.textContent || '').trim().slice(0, 40);
                } catch (e) { }
            }
            // 复合指纹：有 b 段则能区分同章内不同小节；都没有则退化为纯章节 id
            return chap + '|' + sec;
        };
        var requestJumpNext = function (why) {
            var fp = getSectionFingerprint();
            var kid = fp.split('|')[0];
            if (!kid && !fp.split('|')[1]) {
                // 异常页面认不出当前小节：不拦截，按原逻辑跳转
                _w.top.jump = true;
                return;
            }
            var runToken = 'norun';
            try {
                runToken = _w.sessionStorage.getItem('unrivalRunToken');
                if (!runToken) {
                    runToken = 'r' + Date.now() + Math.floor(Math.random() * 1000000);
                    _w.sessionStorage.setItem('unrivalRunToken', runToken);
                }
            } catch (e) { }
            // 会话令牌可用 → 记录 6 小时；不可用 → 退化为 10 分钟 TTL，避免影响下次正常重刷
            var ttl = runToken === 'norun' ? 10 * 60 * 1000 : 6 * 60 * 60 * 1000;
            var storeKey = 'unrivalJumpHist_' + courseId + '_' + classId,
                now = Date.now(),
                hist = {};
            try {
                hist = JSON.parse(GM_getValue(storeKey, '{}')) || {};
            } catch (e) {
                hist = {};
            }
            var k = runToken + '_' + fp;
            var writeBack = function () {
                try {
                    // 顺手清理 7 天前的旧记录，防止无限增长
                    for (var hk in hist) {
                        var hv = hist[hk];
                        var ht = (hv && typeof hv === 'object') ? hv.t : hv;
                        if (!ht || now - ht > 7 * 24 * 60 * 60 * 1000) delete hist[hk];
                    }
                    GM_setValue(storeKey, JSON.stringify(hist));
                } catch (e) { }
            };
            var halt = function (info, msg, color) {
                stop = true;
                try { clearInterval(loopjob); } catch (e) { }
                _w.top.unrivalWorkInfo = info;
                logs.addLog(msg, color || 'red');
            };
            // ⚠ 关键：这里【不再】做「是否已到最后一章」的判定，也不再依赖 countSections()。
            // 本函数在页面刚导航过来时就被调用，此时目录与「下一节」按钮都还没渲染完，
            // 任何基于 DOM 的统计都不可靠；据此停止必然误杀 —— 表现为「还没到最后一章
            // 就停止」甚至「根本不切换下一节」。
            // 真正的最后一章判定统一交给 jjump（延迟数秒 + 重试，页面已渲染完），才准确。
            var visit = 1;
            if (hist[k] && now - ((hist[k].t || hist[k])) < ttl) {
                visit = ((hist[k].n) || 1) + 1;
            }
            hist[k] = { t: now, n: visit };
            jumpCount += 1;
            // 唯一的兜底：同一小节反复发起跳转十几次仍未推进，才认为真的卡住，避免无限打转
            if (visit > 12) {
                writeBack();
                halt('跳转疑似卡住，脚本已停止',
                    '已停止：同一小节连续 ' + visit + ' 次发起跳转仍未推进，脚本已停止以免无限打转。', 'red');
                return;
            }
            writeBack();
            // 本帧与顶层 window 都置位：不同页面分支监听的 jump 所在 window 不同，
            // 两处都写才不会漏触发（只写一处曾导致「不自动切换下一节」）。
            _w.top.jump = true;
            _w.jump = true;
        };
        readyCheck();
        try {
            var pageData = JSON.parse(param);
        } catch (e) {
            if (jumpType != 2) {
                requestJumpNext('此页无任务');
                logs.addLog('此页无任务，准备自动下一章', 'green');
            } else {
                logs.addLog('此页无任务，用户设置为不跳转，脚本已结束运行，如需自动跳转，请编辑脚本代码参数', 'green');
            }
            return;
        }
        var data = pageData['defaults'],
            jobList = [],
            classId = data['clazzId'],
            chapterId = data['knowledgeid'],
            reportUrl = data['reportUrl'];
        UID = UID || data['userid'];
        FID = FID || data['fid'];
        for (let i = 0, l = pageData['attachments'].length; i < l; i++) {
            let item = pageData['attachments'][i];
            if (item['job'] != true || item['isPassed'] == true) {
                if (_w.top.unrivalReviewMode == '1' && item['type'] == 'video') {
                    jobList.push(item);
                }
                continue;
            } else {
                jobList.push(item);
            }
        }
        var video_getReady = (item) => {
            let statusUrl = _p + '//' + _h + '/ananas/status/' + item['property']['objectid'] + '?k=' +
                FID + '&flag=normal&_dc=' + String(Math.round(new Date())),
                doubleSpeed = item['property']['doublespeed'];
            busyThread += 1;
            GM_xmlhttpRequest({
                method: "get",
                headers: {
                    'Host': _h,
                    'Referer': vrefer,
                    'Sec-Fetch-Site': 'same-origin'
                },
                url: statusUrl,
                onload: function (res) {
                    try {
                        busyThread -= 1;
                        let videoInfo = JSON.parse(res.responseText),
                            duration = videoInfo['duration'],
                            dtoken = videoInfo['dtoken'];
                        if (duration == undefined) {
                            '<div class="job-item"><span class="job-status">无效视频</span>' +
                                '<span class="job-name">' + item['property']['name'] + '</span></div>';
                            return;
                        }
                        missionList['m' + item['jobid']] = {
                            'module': item['property']['module'],
                            'type': 'video',
                            'dtoken': dtoken,
                            'duration': duration,
                            'objectId': item['property']['objectid'],
                            'rt': item['property']['rt'] || '0.9',
                            'otherInfo': item['otherInfo'],
                            'doublespeed': doubleSpeed,
                            'jobid': item['jobid'],
                            'name': item['property']['name'],
                            'done': false,
                            'running': false
                        };
                        '<div class="job-item"><span class="job-status">视频</span>' +
                                '<span class="job-name">' + item['property']['name'] + '</span></div>';
                    } catch (e) { }
                },
                onerror: function (err) {
                    console.log(err);
                    if (err.error.indexOf('@connect list') >= 0) {
                        logs.addLog('请添加安全网址，将 【 //@connect      ' + _h +
                            ' 】方括号里的内容(不包括方括号)添加到脚本代码内指定位置，否则脚本无法正常运行，如图所示：', 'red');
                        logs.addLog(
                            '<img src="https://pan-yz.chaoxing.com/thumbnail/0,0,0/609a8b79cbd6a91d10c207cf2b5f368d">'
                        );
                        stop = true;
                    } else {
                        logs.addLog('获取任务详情失败', 'red');
                        logs.addLog('错误原因：' + err.error, 'red');
                    }
                }
            });
        },
            doVideo = (item) => {
                if (rate <= 0) {
                    missionList['m' + item['jobid']]['running'] = true;
                    logs.addLog('奇怪的倍速，视频已自动跳过', 'orange');
                    setTimeout(function () {
                        missionList['m' + item['jobid']]['running'] = false;
                        missionList['m' + item['jobid']]['done'] = true;
                    }, 5000);
                    return;
                }
                if (allowBackground && backGround) {
                    if (_w.top.document.getElementsByClassName('catalog_points_sa').length > 0 || _w.top.document
                        .getElementsByClassName('lock').length > 0) {
                        logs.addLog('您已安装超星挂机小助手，但此课程可能为闯关模式，不支持后台挂机，将为您在线完成', 'blue');
                    } else {
                        item['userid'] = UID;
                        item['classId'] = classId;
                        item['review'] = [false, true][_w.top.unrivalReviewMode];
                        item['reportUrl'] = reportUrl;
                        item['rt'] = missionList['m' + item['jobid']]['rt'];
                        GM_setValue('unrivalBackgroundVideo', item);
                        _d.cookie = "videojs_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                        logs.addLog(
                            '您已安装超星挂机小助手，已添加至后台任务，<a href="unrivalxxtbackground/" target="view_window">点我查看后台</a>',
                            'green');
                        missionList['m' + item['jobid']]['running'] = true;
                        setTimeout(function () {
                            missionList['m' + item['jobid']]['running'] = false;
                            missionList['m' + item['jobid']]['done'] = true;
                        }, 5000);
                        return;
                    }
                }
                let videojs_id = String(parseInt(Math.random() * 9999999));
                _d.cookie = 'videojs_id=' + videojs_id + ';path=/'
                logs.addLog('开始刷视频：' + item['name'] + '，倍速：' + String(rate) + '倍');
                logs.addLog('视频观看信息每60秒上报一次，请耐心等待', 'green');
                if (disableMonitor) {
                    logs.addLog('解除多端学习监控有清除进度风险，请谨慎使用', 'orange');
                }
                let dtype = 'Video';
                if (item['module'].includes('audio')) {
                    dtype = 'Audio';
                    rt = '';
                }
                let playTime = 0,
                    playsTime = 0,
                    isdrag = '3',
                    times = 0,
                    encUrl = '',
                    first = true,
                    loop = setInterval(function () {
                        // 暂停中：冻结视频进度，不推进、不上报，避免跳进度或清空学习记录
                        if (_w.top.unrivalPaused == '1') {
                            return;
                        }
                        if (rate <= 0) {
                            clearInterval(loop);
                            logs.addLog('奇怪的倍速，视频已自动跳过', 'orange');
                            setTimeout(function () {
                                missionList['m' + item['jobid']]['running'] = false;
                                missionList['m' + item['jobid']]['done'] = true;
                            }, 5000);
                            return;
                        }
                        rt = missionList['m' + item['jobid']]['rt'];
                        playsTime += rate;
                        playTime = Math.ceil(playsTime);
                        if (times == 0 || times % 30 == 0 || playTime >= item['duration']) {
                            if (first) {
                                playTime = 0;
                            }
                            if (playTime >= item['duration']) {
                                clearInterval(loop);
                                playTime = item['duration'];
                                isdrag = '4';
                            } else if (playTime > 0) {
                                isdrag = '0';
                            }
                            encUrl = host + 'chaoXing/v3/getEnc.php?classid=' + classId +
                                '&playtime=' + playTime + '&duration=' + item['duration'] + '&objectid=' + item[
                                'objectId'] + '&jobid=' + item['jobid'] + '&uid=' + UID;
                            busyThread += 1;
                            var _bold_playTime = playTime;
                            function ecOnload(res) {
                                let enc = '';
                                if (res && res.status == 200) {
                                    enc = res.responseText;
                                    if (enc.includes('--#')) {
                                        let warnInfo = enc.match(new RegExp('--#(.*?)--#', "ig"))[0]
                                            .replace(/--#/ig, '');
                                        logs.addLog(warnInfo, 'red');
                                        enc = enc.replace(/--#(.*?)--#/ig, '');
                                    }
                                    if (enc.indexOf('.stop') >= 0) {
                                        clearInterval(loop);
                                        stop = true;
                                        return;
                                    }
                                } else {
                                    strEc = `[${classId}][${UID}][${item['jobid']}][${item['objectId']}][${playTime * 1000}][d_yHJ!$pdA~5][${item['duration'] * 1000}][0_${item['duration']}]`,
                                        enc = jq.md5(strEc);
                                }
                                if (enc.length != 32) {
                                    clearInterval(loop);
                                    stop = true;
                                    return;
                                }
                                let reportsUrl = reportUrl + '/' + item['dtoken'] +
                                    '?clazzId=' + classId + '&playingTime=' + playTime +
                                    '&duration=' + item['duration'] + '&clipTime=0_' + item[
                                    'duration'] + '&objectId=' + item['objectId'] +
                                    '&otherInfo=' + item['otherInfo'] + '&jobid=' + item[
                                    'jobid'] + '&userid=' + UID + '&isdrag=' + isdrag +
                                    '&view=pc&enc=' + enc + '&rt=' + rt + '&dtype=' + dtype +
                                    '&_t=' + String(Math.round(new Date()));
                                GM_xmlhttpRequest({
                                    method: "get",
                                    headers: {
                                        'Host': _h,
                                        'Referer': vrefer,
                                        'Sec-Fetch-Site': 'same-origin',
                                        'Content-Type': 'application/json'
                                    },
                                    url: reportsUrl,
                                    onload: function (res) {
                                        try {
                                            let today = new Date(),
                                                todayStr = today.getFullYear() +
                                                    'd' + today.getMonth() + 'd' + today
                                                        .getDate(),
                                                timelong = GM_getValue(
                                                    'unrivaltimelong', {});
                                            if (timelong[UID] == undefined ||
                                                timelong[UID]['today'] != todayStr
                                            ) {
                                                timelong[UID] = {
                                                    'time': 0,
                                                    'today': todayStr
                                                };
                                            } else {
                                                timelong[UID]['time']++;
                                            }
                                            GM_setValue('unrivaltimelong',
                                                timelong);
                                            busyThread -= 1;
                                            if (timelong[UID]['time'] / 60 > 22 &&
                                                item['doublespeed'] == 0 && _w.top
                                                    .unrivalReviewMode == '0') {
                                                clearInterval(loop);
                                                logs.addLog(
                                                    '今日学习时间过长，继续学习会导致清空进度，请明天再来',
                                                    'red');
                                                setTimeout(function () {
                                                    missionList['m' + item[
                                                        'jobid']][
                                                        'running'
                                                    ] = false;
                                                    missionList['m' + item[
                                                        'jobid']][
                                                        'done'
                                                    ] = true;
                                                }, 5000);
                                                return;
                                            }
                                            let ispass = JSON.parse(res
                                                .responseText);
                                            first = false;
                                            if (ispass['isPassed'] && _w.top
                                                .unrivalReviewMode == '0') {
                                                logs.addLog('视频任务已完成', 'green');
                                                missionList['m' + item['jobid']]['running'] = false;
                                                missionList['m' + item['jobid']]['done'] = true;
                                                clearInterval(loop);
                                                return;
                                            } else if (isdrag == '4') {
                                                if (_w.top.unrivalReviewMode ==
                                                    '1') {
                                                    logs.addLog('视频已观看完毕', 'green');
                                                } else {
                                                    logs.addLog('视频已观看完毕，但视频任务未完成',
                                                        'red');
                                                }
                                                missionList['m' + item['jobid']][
                                                    'running'
                                                ] = false;
                                                missionList['m' + item['jobid']][
                                                    'done'
                                                ] = true;
                                                try {
                                                    clearInterval(loop);
                                                } catch (e) {

                                                }
                                            } else {
                                                logs.addLog(item['name'] + '已观看' +
                                                    _bold_playTime + '秒，剩余大约' +
                                                    String(item['duration'] -
                                                        _bold_playTime) + '秒');
                                            }
                                        } catch (e) {
                                            console.log(e);
                                            if (res.responseText.indexOf('验证码') >=
                                                0) {
                                                logs.addLog('已被超星风控，请<a href="' +
                                                    reportsUrl +
                                                    '" target="_blank">点我处理</a>，60秒后自动刷新页面',
                                                    'red');
                                                missionList['m' + item['jobid']][
                                                    'running'
                                                ] = false;
                                                clearInterval(loop);
                                                stop = true;
                                                setTimeout(function () {
                                                    _l.reload();
                                                }, 60000);
                                                return;
                                            }
                                            logs.addLog('超星返回错误信息，十秒后重试', 'red');
                                            times = -10;
                                            return;
                                        }
                                    },
                                    onerror: function (err) {
                                        console.log(err);
                                        if (err.error.indexOf('@connect list') >=
                                            0) {
                                            logs.addLog(
                                                '请添加安全网址，将 【 //@connect      ' +
                                                _h +
                                                ' 】方括号里的内容(不包括方括号)添加到脚本代码内指定位置，否则脚本无法正常运行，如图所示：',
                                                'red');
                                            logs.addLog(
                                                '<img src="https://pan-yz.chaoxing.com/thumbnail/0,0,0/609a8b79cbd6a91d10c207cf2b5f368d">'
                                            );
                                            stop = true;
                                        } else {
                                            logs.addLog('观看视频失败', 'red');
                                            logs.addLog('错误原因：' + err.error, 'red');
                                        }
                                        missionList['m' + item['jobid']][
                                            'running'
                                        ] = false;
                                        clearInterval(loop);
                                    }
                                });
                            };
                            GM_xmlhttpRequest({
                                method: "get",
                                url: encUrl,
                                timeout: 2000,
                                onload: ecOnload,
                                onerror: function (err) {
                                    console.log(err);
                                    ecOnload(false);
                                },
                                ontimeout: function (err) {
                                    console.log(err);
                                    ecOnload(false);
                                }
                            });
                        }
                        times += 1;
                    }, 1000);
                missionList['m' + item['jobid']]['running'] = true;
            },
            doDocument = (item) => {
                missionList['m' + item['jobid']]['running'] = true;
                logs.addLog('开始刷文档：' + item['name']);
                var runDocument = function () {
                    // 暂停中：推迟到恢复后再发起文档任务
                    if (_w.top.unrivalPaused == '1') {
                        setTimeout(runDocument, 1000);
                        return;
                    }
                    busyThread += 1;
                    GM_xmlhttpRequest({
                        method: "get",
                        url: _p + '//' + _h + '/ananas/job/document?jobid=' + item['jobid'] +
                            '&knowledgeid=' + chapterId + '&courseid=' + courseId + '&clazzid=' +
                            classId + '&jtoken=' + item['jtoken'],
                        onload: function (res) {
                            try {
                                busyThread -= 1;
                                let ispass = JSON.parse(res.responseText);
                                if (ispass['status']) {
                                    logs.addLog('文档任务已完成', 'green');
                                } else {
                                    logs.addLog('文档已阅读完成，但任务点未完成', 'red');
                                }

                            } catch (err) {
                                console.log(err);
                                console.log(res.responseText);
                                logs.addLog('解析文档内容失败', 'red');
                            }
                            missionList['m' + item['jobid']]['running'] = false;
                            missionList['m' + item['jobid']]['done'] = true;
                        },
                        onerror: function (err) {
                            console.log(err);
                            if (err.error.indexOf('@connect list') >= 0) {
                                logs.addLog('请添加安全网址，将 【 //@connect      ' + _h +
                                    ' 】方括号里的内容(不包括方括号)添加到脚本代码内指定位置，否则脚本无法正常运行，如图所示：', 'red');
                                logs.addLog(
                                    '<img src="https://pan-yz.chaoxing.com/thumbnail/0,0,0/609a8b79cbd6a91d10c207cf2b5f368d">'
                                );
                                stop = true;
                            } else {
                                logs.addLog('阅读文档失败', 'red');
                                logs.addLog('错误原因：' + err.error, 'red');
                            }
                            missionList['m' + item['jobid']]['running'] = false;
                            missionList['m' + item['jobid']]['done'] = true;
                        }
                    });
                };
                setTimeout(runDocument, parseInt(Math.random() * 2000 + 9000, 10))
            },
            doWork = (item) => {
                missionList['m' + item['jobid']]['running'] = true;
                logs.addLog('开始刷章节测试：' + item['name']);
                logs.addLog('您设置的答题正确率为：' + String(accuracy) + '%，只有在高于此正确率时才会提交测试', 'blue');
                _d.getElementById('workPanel').style.display = 'block';
                _d.getElementById('frame_content').src = _p + '//' + _h + '/work/phone/work?workId=' + item['jobid']
                    .replace('work-', '') + '&courseId=' + courseId + '&clazzId=' + classId + '&knowledgeId=' +
                    chapterId + '&jobId=' + item['jobid'] + '&enc=' + item['enc'];
                _w.top.unrivalWorkInfo = '';
                _w.top.unrivalDoneWorkId = '';
                setInterval(function () {
                    if (_w.top.unrivalWorkInfo != '') {
                        logs.addLog(_w.top.unrivalWorkInfo);
                        _w.top.unrivalWorkInfo = '';
                    }
                }, 100);
                let checkcross = setInterval(function () {
                    if (_w.top.unrivalWorkDone == false) {
                        clearInterval(checkcross);
                        return;
                    }
                    let ifW = _d.getElementById('frame_content').contentWindow;
                    try {
                        ifW.location.href;
                    } catch (e) {
                        console.log(e);
                        if (e.message.indexOf('cross-origin') != -1) {
                            clearInterval(checkcross);
                            _w.top.unrivalWorkDone = true;
                            return;
                        }
                    }
                }, 2000);
                let workDoneInterval = setInterval(function () {
                    if (_w.top.unrivalWorkDone) {
                        _w.top.unrivalWorkDone = false;
                        clearInterval(workDoneInterval);
                        _w.top.unrivalDoneWorkId = '';
                        _d.getElementById('workPanel').style.display = 'none';
                        _d.getElementById('frame_content').src = '';
                        setTimeout(function () {
                            missionList['m' + item['jobid']]['running'] = false;
                            missionList['m' + item['jobid']]['done'] = true;
                        }, 5000);
                    }
                }, 500);
            },
            missionList = [];
        if (jobList.length <= 0) {
            if (jumpType != 2) {
                requestJumpNext('此页无任务');
                logs.addLog('此页无任务，准备自动下一章', 'green');
            } else {
                logs.addLog('此页无任务，用户设置为不跳转，脚本已结束运行，如需自动跳转，请编辑脚本代码参数', 'green');
            }
            return;
        }
        for (let i = 0, l = jobList.length; i < l; i++) {
            let item = jobList[i];
            if (item['type'] == 'video') {
                video_getReady(item);
            } else if (item['type'] == 'document') {
                missionList['m' + item['jobid']] = {
                    'type': 'document',
                    'jtoken': item['jtoken'],
                    'jobid': item['jobid'],
                    'name': item['property']['name'],
                    'done': false,
                    'running': false
                };
                '<div class="job-item"><span class="job-status">文档</span>' +
                            '<span class="job-name">' + item['property']['name'] + '</span></div>';
            } else if (item['type'] == 'workid' && _w.top.unrivalDoWork == '1') {
                missionList['m' + item['jobid']] = {
                    'type': 'work',
                    'workid': item['property']['workid'],
                    'jobid': item['jobid'],
                    'name': item['property']['title'],
                    'enc': item['enc'],
                    'done': false,
                    'running': false
                };
                '<div class="job-item"><span class="job-status">章节测试</span>' +
                            '<span class="job-name">' + item['property']['title'] + '</span></div>';
            } else {
                try {
                    let jobName = item['property']['name'];
                    if (jobName == undefined) {
                        jobName = item['property']['title'];
                    }
                    '<div class="job-item"><span class="job-status">已跳过</span>' +
                                '<span class="job-name">' + jobName + '</span></div>';
                } catch (e) { }
            }
        }
        loopjob();
    } else if (_l.href.includes("mycourse/studentstudy")) {
        var audiofile =
            'data:audio/ogg;base64,T2dnUwACAAAAAAAAAABwRPFFAAAAAGFtEqwBHgF2b3JiaXMAAAAAAUAfAAAAAAAAUHgAAAAAAACZAU9nZ1MAAAAAAAAAAAAAcETxRQEAAAA7J4IBDP8F////////////tQN2b3JiaXMvAAAAWGlwaC5PcmcgbGliVm9yYmlzIEkgMjAxNDAxMjIgKFR1cnBha8OkcsOkamlpbikGAAAAJQAAAEVOQ09ERVI9U291bmQgU3R1ZGlvLCBsaWJWb3JiaXMgMS4zLjEbAAAAQUxCVU0gQVJUSVNUPUFkdmVudHVyZSBMYW5kFAAAAEFMQlVNPUFkdmVudHVyZSBMYW5kIQAAAEVOQ09ESU5HIEFQUExJQ0FUSU9OPVNvdW5kIFN0dWRpbxUAAABBUlRJU1Q9QWR2ZW50dXJlIExhbmQjAAAAVElUTEU9RW1wdHkgTG9vcCBGb3IgSlMgUGVyZm9ybWFuY2UBBXZvcmJpcxJCQ1YBAAABAAxSFCElGVNKYwiVUlIpBR1jUFtHHWPUOUYhZBBTiEkZpXtPKpVYSsgRUlgpRR1TTFNJlVKWKUUdYxRTSCFT1jFloXMUS4ZJCSVsTa50FkvomWOWMUYdY85aSp1j1jFFHWNSUkmhcxg6ZiVkFDpGxehifDA6laJCKL7H3lLpLYWKW4q91xpT6y2EGEtpwQhhc+211dxKasUYY4wxxsXiUyiC0JBVAAABAABABAFCQ1YBAAoAAMJQDEVRgNCQVQBABgCAABRFcRTHcRxHkiTLAkJDVgEAQAAAAgAAKI7hKJIjSZJkWZZlWZameZaouaov+64u667t6roOhIasBADIAAAYhiGH3knMkFOQSSYpVcw5CKH1DjnlFGTSUsaYYoxRzpBTDDEFMYbQKYUQ1E45pQwiCENInWTOIEs96OBi5zgQGrIiAIgCAACMQYwhxpBzDEoGIXKOScggRM45KZ2UTEoorbSWSQktldYi55yUTkompbQWUsuklNZCKwUAAAQ4AAAEWAiFhqwIAKIAABCDkFJIKcSUYk4xh5RSjinHkFLMOcWYcowx6CBUzDHIHIRIKcUYc0455iBkDCrmHIQMMgEAAAEOAAABFkKhISsCgDgBAIMkaZqlaaJoaZooeqaoqqIoqqrleabpmaaqeqKpqqaquq6pqq5seZ5peqaoqp4pqqqpqq5rqqrriqpqy6ar2rbpqrbsyrJuu7Ks256qyrapurJuqq5tu7Js664s27rkearqmabreqbpuqrr2rLqurLtmabriqor26bryrLryratyrKua6bpuqKr2q6purLtyq5tu7Ks+6br6rbqyrquyrLu27au+7KtC7vourauyq6uq7Ks67It67Zs20LJ81TVM03X9UzTdVXXtW3VdW1bM03XNV1XlkXVdWXVlXVddWVb90zTdU1XlWXTVWVZlWXddmVXl0XXtW1Vln1ddWVfl23d92VZ133TdXVblWXbV2VZ92Vd94VZt33dU1VbN11X103X1X1b131htm3fF11X11XZ1oVVlnXf1n1lmHWdMLqurqu27OuqLOu+ruvGMOu6MKy6bfyurQvDq+vGseu+rty+j2rbvvDqtjG8um4cu7Abv+37xrGpqm2brqvrpivrumzrvm/runGMrqvrqiz7uurKvm/ruvDrvi8Mo+vquirLurDasq/Lui4Mu64bw2rbwu7aunDMsi4Mt+8rx68LQ9W2heHVdaOr28ZvC8PSN3a+AACAAQcAgAATykChISsCgDgBAAYhCBVjECrGIIQQUgohpFQxBiFjDkrGHJQQSkkhlNIqxiBkjknIHJMQSmiplNBKKKWlUEpLoZTWUmotptRaDKG0FEpprZTSWmopttRSbBVjEDLnpGSOSSiltFZKaSlzTErGoKQOQiqlpNJKSa1lzknJoKPSOUippNJSSam1UEproZTWSkqxpdJKba3FGkppLaTSWkmptdRSba21WiPGIGSMQcmck1JKSamU0lrmnJQOOiqZg5JKKamVklKsmJPSQSglg4xKSaW1kkoroZTWSkqxhVJaa63VmFJLNZSSWkmpxVBKa621GlMrNYVQUgultBZKaa21VmtqLbZQQmuhpBZLKjG1FmNtrcUYSmmtpBJbKanFFluNrbVYU0s1lpJibK3V2EotOdZaa0ot1tJSjK21mFtMucVYaw0ltBZKaa2U0lpKrcXWWq2hlNZKKrGVklpsrdXYWow1lNJiKSm1kEpsrbVYW2w1ppZibLHVWFKLMcZYc0u11ZRai621WEsrNcYYa2415VIAAMCAAwBAgAlloNCQlQBAFAAAYAxjjEFoFHLMOSmNUs45JyVzDkIIKWXOQQghpc45CKW01DkHoZSUQikppRRbKCWl1losAACgwAEAIMAGTYnFAQoNWQkARAEAIMYoxRiExiClGIPQGKMUYxAqpRhzDkKlFGPOQcgYc85BKRljzkEnJYQQQimlhBBCKKWUAgAAChwAAAJs0JRYHKDQkBUBQBQAAGAMYgwxhiB0UjopEYRMSielkRJaCylllkqKJcbMWomtxNhICa2F1jJrJcbSYkatxFhiKgAA7MABAOzAQig0ZCUAkAcAQBijFGPOOWcQYsw5CCE0CDHmHIQQKsaccw5CCBVjzjkHIYTOOecghBBC55xzEEIIoYMQQgillNJBCCGEUkrpIIQQQimldBBCCKGUUgoAACpwAAAIsFFkc4KRoEJDVgIAeQAAgDFKOSclpUYpxiCkFFujFGMQUmqtYgxCSq3FWDEGIaXWYuwgpNRajLV2EFJqLcZaQ0qtxVhrziGl1mKsNdfUWoy15tx7ai3GWnPOuQAA3AUHALADG0U2JxgJKjRkJQCQBwBAIKQUY4w5h5RijDHnnENKMcaYc84pxhhzzjnnFGOMOeecc4wx55xzzjnGmHPOOeecc84556CDkDnnnHPQQeicc845CCF0zjnnHIQQCgAAKnAAAAiwUWRzgpGgQkNWAgDhAACAMZRSSimllFJKqKOUUkoppZRSAiGllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimVUkoppZRSSimllFJKKaUAIN8KBwD/BxtnWEk6KxwNLjRkJQAQDgAAGMMYhIw5JyWlhjEIpXROSkklNYxBKKVzElJKKYPQWmqlpNJSShmElGILIZWUWgqltFZrKam1lFIoKcUaS0qppdYy5ySkklpLrbaYOQelpNZaaq3FEEJKsbXWUmuxdVJSSa211lptLaSUWmstxtZibCWlllprqcXWWkyptRZbSy3G1mJLrcXYYosxxhoLAOBucACASLBxhpWks8LR4EJDVgIAIQEABDJKOeecgxBCCCFSijHnoIMQQgghREox5pyDEEIIIYSMMecghBBCCKGUkDHmHIQQQgghhFI65yCEUEoJpZRSSucchBBCCKWUUkoJIYQQQiillFJKKSGEEEoppZRSSiklhBBCKKWUUkoppYQQQiillFJKKaWUEEIopZRSSimllBJC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',
            audioPlayer = new Audio(audiofile);
        // 挂机默认自动激活（原「激活挂机」按钮已移除），无需再手动点击
        _w.top.backNow = 1;
        audioPlayer.loop = true;
        _w.audioPlayer = audioPlayer;
        setInterval(function () {
            try {
                _w.jQuery.fn.viewer.Constructor.prototype.show = () => { };
            } catch (e) {
            }
        }, 1000);
        try {
            _w.unrivalScriptList.push('Fuck me please');
        } catch (e) {
            _w.unrivalScriptList = ['Fuck me please'];
        }
        function checkOffline() {
            let dleft = _d.getElementsByClassName('left');
            if (dleft.length == 1) {
                let img = dleft[0].getElementsByTagName('img');
                if (img.length == 1) {
                    if (img[0].src.indexOf('loading.gif') != -1) {
                        return true;
                    }
                }
            }
            return false;
        }
        setInterval(function () {
            if (checkOffline()) {
                setTimeout(function () {
                    if (checkOffline()) {
                        _l.reload();
                    }
                }, 10000)
            }
        }, 3000);
        _d.addEventListener('visibilitychange', function () {
            var c = 0;
            if (_w.top.backNow == 0) {
                _d.title = '⚠️请先激活挂机';
                return
            } else {
                _d.title = '学生学习页面';
            }
            if (_d.hidden) {
                audioPlayer.play();
                var timer = setInterval(function () {
                    if (c) {
                        _d.title = '🙈挂机中';
                        c = 0;
                    } else {
                        _d.title = '🙉挂机中';
                        c = 1;
                    }
                    if (!_d.hidden) {
                        clearInterval(timer);
                        _d.title = '学生学习页面';
                    }
                }, 1300);
            } else {
                audioPlayer.pause();
            }
        });
        _w.unrivalgetTeacherAjax = _w.getTeacherAjax;
        _w.getTeacherAjax = (courseid, classid, cid) => {
            if (cid == getQueryVariable('chapterId')) {
                return;
            }
            _w.top.unrivalPageRd = '';
            _w.unrivalgetTeacherAjax(courseid, classid, cid);
        }
        if (disableMonitor == 1) {
            _w.appendChild = _w.Element.prototype.appendChild;
            _w.Element.prototype.appendChild = function () {
                try {
                    if (arguments[0].src.indexOf('detect.chaoxing.com') > 0) {
                        return;
                    }
                } catch (e) { }
                _w.appendChild.apply(this, arguments);
            };
        }

        _w.jump = false;
        setInterval(function () {
            if (getQueryVariable('mooc2') == '1') {
                let tabs = _d.getElementsByClassName('posCatalog_select');
                for (let i = 0, l = tabs.length; i < l; i++) {
                    let tabId = tabs[i].getAttribute('id');
                    if (tabId.indexOf('cur') >= 0 && tabs[i].getAttribute('class') == 'posCatalog_select') {
                        tabs[i].setAttribute('onclick', "getTeacherAjax('" + courseId + "','" + classId +
                            "','" + tabId.replace('cur', '') + "');");
                    }
                }
            } else {
                let h4s = _d.getElementsByTagName('h4'),
                    h5s = _d.getElementsByTagName('h5');
                for (let i = 0, l = h4s.length; i < l; i++) {
                    if (h4s[i].getAttribute('id').indexOf('cur') >= 0) {
                        h4s[i].setAttribute('onclick', "getTeacherAjax('" + courseId + "','" + classId +
                            "','" + h4s[i].getAttribute('id').replace('cur', '') + "');");
                    }
                }
                for (let i = 0, l = h5s.length; i < l; i++) {
                    if (h5s[i].getAttribute('id').indexOf('cur') >= 0) {
                        h5s[i].setAttribute('onclick', "getTeacherAjax('" + courseId + "','" + classId +
                            "','" + h5s[i].getAttribute('id').replace('cur', '') + "');");
                    }
                }
            }
        }, 1000);
        setInterval(function () {
            let but = null;
            if (_w.jump) {
                _w.jump = false;
                _w.top.unrivalDoneWorkId = '';
                _w.jjump = (rd) => {
                    if (rd != _w.top.unrivalPageRd) {
                        return;
                    }
                    try {
                        setTimeout(function () {
                            if (jumpType == 1) {
                                // 用统一的查找函数（新旧版都查，不依赖 mooc2 参数），并带重试：
                                // 页面导航后按钮可能要几秒才渲染出来，查一次找不到就判「最后一章」会误杀，
                                // 因此这里最多重试 4 次（共约 10 秒），仍找不到才确认是最后一节。
                                setTimeout(function () {
                                    var tryClick = function (attempt) {
                                        if (rd != _w.top.unrivalPageRd) {
                                            return;
                                        }
                                        var btn = null;
                                        try {
                                            btn = findNextButton();
                                        } catch (e) {
                                            safeLog('查找「下一节」按钮出错：' + (e && e.message ? e.message : e), 'red');
                                        }
                                        if (btn) {
                                            try {
                                                btn.click();
                                                safeLog('已点击「下一节」，准备切换下一小节', 'green');
                                            } catch (e) {
                                                safeLog('点击「下一节」失败：' + (e && e.message ? e.message : e), 'red');
                                            }
                                            return;
                                        }
                                        if (attempt < 4) {
                                            setTimeout(function () {
                                                tryClick(attempt + 1);
                                            }, 2000);
                                            return;
                                        }
                                        // 重试 4 次仍找不到 → 确认已到最后一节，收尾
                                        _w.top.unrivalWorkInfo = '已到最后一章，脚本已停止';
                                        safeLog('已到最后一章：多次查找均未找到「下一节」按钮，脚本停止运行。', 'red');
                                        stop = true;
                                    };
                                    tryClick(0);
                                }, 2000);
                                return;
                            }
                            if (getQueryVariable('mooc2') == '1') {
                                let ul = _d.getElementsByClassName('prev_ul')[0],
                                    lis = ul.getElementsByTagName('li');
                                for (let i = 0, l = lis.length; i < l; i++) {
                                    if (lis[i].getAttribute('class') == 'active') {
                                        if (i + 1 >= l) {
                                            break;
                                        } else {
                                            try {
                                                lis[i + 1].click();
                                            } catch (e) { }
                                            return;
                                        }
                                    }
                                }
                                let tabs = _d.getElementsByClassName('posCatalog_select');
                                for (let i = 0, l = tabs.length; i < l; i++) {
                                    if (tabs[i].getAttribute('class') ==
                                        'posCatalog_select posCatalog_active') {
                                        while (i + 1 < tabs.length) {
                                            let nextTab = tabs[i + 1];
                                            if ((nextTab.innerHTML.includes(
                                                'icon_Completed prevTips') && _w.top
                                                    .unrivalReviewMode == '0') || nextTab
                                                        .innerHTML.includes(
                                                            'catalog_points_er prevTips')) {
                                                i++;
                                                continue;
                                            }
                                            if (nextTab.id.indexOf('cur') < 0) {
                                                i++;
                                                continue;
                                            }
                                            let clickF = setInterval(function () {
                                                if (rd != _w.top.unrivalPageRd) {
                                                    clearInterval(clickF);
                                                    return;
                                                }
                                                nextTab.click();
                                            }, 2000);
                                            break;
                                        }
                                        break;
                                    }
                                }
                            } else {
                                let div = _d.getElementsByClassName('tabtags')[0],
                                    spans = div.getElementsByTagName('span');
                                for (let i = 0, l = spans.length; i < l; i++) {
                                    if (spans[i].getAttribute('class').indexOf('currents') >=
                                        0) {
                                        if (i + 1 == l) {
                                            break;
                                        } else {
                                            try {
                                                spans[i + 1].click();
                                            } catch (e) { }
                                            return;
                                        }
                                    }
                                }
                                let tabs = _d.getElementsByTagName('span'),
                                    newTabs = [];
                                for (let i = 0, l = tabs.length; i < l; i++) {
                                    if (tabs[i].getAttribute('style') != null && tabs[i]
                                        .getAttribute('style').indexOf(
                                            'cursor:pointer;height:18px;') >= 0) {
                                        newTabs.push(tabs[i]);
                                    }
                                }
                                tabs = newTabs;
                                for (let i = 0, l = tabs.length; i < l; i++) {
                                    if (tabs[i].parentNode.getAttribute('class') ==
                                        'currents') {
                                        while (i + 1 < tabs.length) {
                                            let nextTab = tabs[i + 1].parentNode;
                                            if ((nextTab.innerHTML.includes(
                                                'roundpoint  blue') && _w.top
                                                    .unrivalReviewMode == '0') || nextTab
                                                        .innerHTML.includes('roundpointStudent  lock')
                                            ) {
                                                i++;
                                                continue;
                                            }
                                            if (nextTab.id.indexOf('cur') < 0) {
                                                i++;
                                                continue;
                                            }
                                            let clickF = setInterval(function () {
                                                if (rd != _w.top.unrivalPageRd) {
                                                    clearInterval(clickF);
                                                    return;
                                                }
                                                nextTab.click();
                                            }, 2000);
                                            break;
                                        }
                                        break;
                                    }
                                }
                            }
                        }, 2000);
                    } catch (e) {
                        // 不再静默吞掉异常：否则跳转彻底失效时界面上什么都不显示，无从排查
                        safeLog('自动跳转执行出错：' + (e && e.message ? e.message : e), 'red');
                    }
                }
                try {
                    _w.onReadComplete1();
                } catch (e) { }
                // ⚠ 原写法 setTimeout('jjump("' + rd + '")') 会在 rd 为 undefined 时
                // 传成字符串 "undefined"，与 _w.top.unrivalPageRd 比较恒不相等 → 直接 return，
                // 跳转永远不执行。改成闭包传真实值，避免这层字符串转换。
                var curRd = _w.top.unrivalPageRd;
                setTimeout(function () {
                    try {
                        _w.jjump(curRd);
                    } catch (e) {
                        safeLog('自动跳转执行出错：' + (e && e.message ? e.message : e), 'red');
                    }
                }, 2856);
            }
        }, 200);
    } else if (_l.href.indexOf("work/phone/doHomeWork") > 0) {
        var wIdE = _d.getElementById('workLibraryId') || _d.getElementById('oldWorkId'),
            wid = wIdE.value;
        _w.top.unrivalWorkDone = false;
        _w.aalert = _w.alert;
        _w.alert = (msg) => {
            if (msg == '保存成功') {
                _w.top.unrivalDoneWorkId = getQueryVariable('workId');
                return;
            }
            aalert(msg);
        }
        if (_w.top.unrivalDoneWorkId == getQueryVariable('workId')) {
            _w.top.unrivalWorkDone = true;
            return;
        }
        _w.confirm = (msg) => {
            return true;
        }
        var questionList = [],
            questionsElement = _d.getElementsByClassName('Py-mian1'),
            questionNum = questionsElement.length,
            totalQuestionNum = questionNum;
        for (let i = 0; i < questionNum; i++) {
            let questionElement = questionsElement[i],
                idElements = questionElement.getElementsByTagName('input'),
                questionId = '0',
                question = questionElement.getElementsByClassName('Py-m1-title fs16')[0].innerHTML;
            question = handleImgs(question).replace(/(<([^>]+)>)/ig, '').replace(/[0-9]{1,3}.\[(.*?)\]/ig, '').replaceAll('\n',
                '').replace(/^\s+/ig, '').replace(/\s+$/ig, '');
            for (let z = 0, k = idElements.length; z < k; z++) {
                try {
                    if (idElements[z].getAttribute('name').indexOf('answer') >= 0) {
                        questionId = idElements[z].getAttribute('name').replace('type', '');
                        break;
                    }
                } catch (e) {
                    console.log(e);
                    continue;
                }
            }
            if (questionId == '0' || question == '') {
                continue;
            }
            typeE = questionElement.getElementsByTagName('input');
            if (typeE == null || typeE == []) {
                continue;
            }
            let typeN = 'fuckme';
            for (let g = 0, h = typeE.length; g < h; g++) {
                if (typeE[g].id == 'answertype' + questionId.replace('answer', '').replace('check', '')) {
                    typeN = typeE[g].value;
                    break;
                }
            }
            if (['0', '1', '3'].indexOf(typeN) < 0) {
                continue;
            }
            type = {
                '0': '单选题',
                '1': '多选题',
                '3': '判断题'
            }[typeN];
            let optionList = {
                length: 0
            };
            if (['单选题', '多选题'].indexOf(type) >= 0) {
                let answersElements = questionElement.getElementsByClassName('answerList')[0].getElementsByTagName(
                    'li');
                for (let x = 0, j = answersElements.length; x < j; x++) {
                    let optionE = answersElements[x],
                        ems = optionE.getElementsByTagName('em'),
                        // 选项字母优先取页面 <em id-param="A">：这是 DOM 的真实取值，也是页面自身点击判定所用的键
                        letter = ems.length > 0 ? String(ems[0].getAttribute('id-param') || '').trim() : '';
                    if (!/^[A-Za-z]$/.test(letter)) {
                        letter = trim(String(optionE.textContent || '')).slice(0, 1);
                    }
                    if (!/^[A-Za-z]$/.test(letter)) {
                        letter = String.fromCharCode(65 + x);
                    }
                    letter = letter.toUpperCase();
                    // 选项正文：去掉 HTML 标签，再去掉开头的字母与常见分隔符（如「A.中国」→「中国」）
                    let optionText = String(optionE.innerHTML || '')
                        .replace(/<[^>]+>/g, '')
                        .replace(/^\s*[A-Za-z]\s*[、.．,，:：)）]?\s*/, '')
                        .replace(/(^\s*)|(\s*$)/g, '');
                    if (optionText == '') {
                        optionText = trim(String(optionE.textContent || ''));
                    }
                    if (optionText == '') {
                        break;
                    }
                    optionList[letter] = {
                        'id': optionE.getAttribute('id-param'),
                        'value': letter,
                        'text': optionText
                    }
                    optionList.length++;
                }
                if (answersElements.length != optionList.length) {
                    continue;
                }
            }
            questionList.push({
                'question': question,
                'type': type,
                'questionid': questionId,
                'options': optionList
            });
        }
        var busyThread = questionList.length,
            processIndex = 0,
            /* ---- 按字母点击选项：字母取自页面 <em id-param>，与页面自身的点击判定同源，最可靠 ---- */
            clickByLetter = function (quu, letter, choiceEs) {
                for (let y = 0, j = choiceEs.length; y < j; y++) {
                    if (choiceEs[y].getElementsByTagName('em').length < 1) continue;
                    if (String(choiceEs[y].getElementsByTagName('em')[0].getAttribute('id-param') || '')
                        .toUpperCase() === String(letter).toUpperCase() &&
                        choiceEs[y].getAttribute('id-param') == quu['questionid'].replace('answer', '')) {
                        if (!String(choiceEs[y].getAttribute('class') || '').includes('cur')) {
                            choiceEs[y].click();
                        }
                        return true;
                    }
                }
                return false;
            },
            /* ---- 把「候选答案数组」应用到页面选项上，返回是否成功作答 ----
             * answers: 候选答案数组。元素既可为选项字母（['A','C']），也可为选项正文（['中国']）。
             *          匹配优先级：字母 > 正文。字母匹配为精确匹配，可彻底避免「AI 说 A 却选了 B」。
             */
            applyAnswers = function (quu, answers, choiceEs) {
                if (!answers || answers.length === 0) return false;
                var ok = false;
                if (quu['type'] === '判断题') {
                    var joined = answers.join('');
                    var val = '';
                    if (/正确|对的|对|是|√|true/i.test(joined) && !/错误|不对|否|×|false/i.test(joined)) {
                        val = 'true';
                    } else if (/错误|不对|否|×|false/i.test(joined)) {
                        val = 'false';
                    }
                    if (val === '') return false;
                    for (let u = 0, k = choiceEs.length; u < k; u++) {
                        if (choiceEs[u].getElementsByTagName('em').length < 1) continue;
                        if (choiceEs[u].getAttribute('val-param') == val &&
                            choiceEs[u].getAttribute('id-param') == quu['questionid'].replace('answer', '')) {
                            choiceEs[u].click();
                            ok = true;
                            break;
                        }
                    }
                    return ok;
                }
                // 归一化候选答案（剥掉「答案：」等前缀、去空白）
                var normAnswers = [];
                for (let a = 0; a < answers.length; a++) {
                    var s = String(answers[a]).trim()
                        .replace(/^(答案|正确答案|正确选项|选项|答)[：:、.．\s]*/, '')
                        .trim();
                    var n = normText(s);
                    if (n !== '') normAnswers.push({ 'n': n, 'up': n.toUpperCase() });
                }
                if (normAnswers.length === 0) return false;
                // 1) 字母优先：命中选项字母直接点，绝不误配
                var byLetter = [];
                for (let lk in quu['options']) {
                    if (lk === 'length') continue;
                    for (let b = 0; b < normAnswers.length; b++) {
                        if (normAnswers[b]['up'] === String(lk).toUpperCase()) {
                            byLetter.push(String(lk).toUpperCase());
                            break;
                        }
                    }
                }
                if (byLetter.length > 0) {
                    if (quu['type'] === '单选题') {
                        ok = clickByLetter(quu, byLetter[0], choiceEs) || ok;
                    } else {
                        for (let w = 0; w < byLetter.length; w++) {
                            if (clickByLetter(quu, byLetter[w], choiceEs)) ok = true;
                        }
                    }
                    if (ok) return true;
                }
                // 2) 正文匹配：答案剥掉字母前缀后与选项正文精确相等
                for (let lk in quu['options']) {
                    if (lk === 'length') continue;
                    var opt = quu['options'][lk],
                        optText = normText(opt['text'] || '').replace(/^[A-Z]/, '');
                    if (optText === '') continue;
                    var hit = false;
                    for (let b = 0; b < normAnswers.length; b++) {
                        var ansNoLetter = normAnswers[b]['up'].replace(/^[A-Z][、.．:：)）]?/, '');
                        if (normAnswers[b]['n'] === optText || ansNoLetter === optText) {
                            hit = true;
                            break;
                        }
                    }
                    if (!hit) continue;
                    if (clickByLetter(quu, String(lk).toUpperCase(), choiceEs)) {
                        ok = true;
                        if (quu['type'] === '单选题') return true;
                    }
                }
                return ok;
            },
            /* ---- 最终兜底：AI 没给出可用答案时的随机作答（仅在正确率阈值 <100 时生效）---- */
            randomFallback = function (quu, choiceEs) {
                if (!(randomDo == 1 && accuracy < 100)) return;
                if (quu['type'] === '判断题') {
                    _w.top.unrivalWorkInfo = quu['question'] + '：AI未给出答案，自动选【错】';
                    for (let u = 0, k = choiceEs.length; u < k; u++) {
                        if (choiceEs[u].getElementsByTagName('em').length < 1) continue;
                        if (choiceEs[u].getAttribute('val-param') == 'false' &&
                            choiceEs[u].getAttribute('id-param') == quu['questionid'].replace('answer', '')) {
                            choiceEs[u].click();
                            return;
                        }
                    }
                } else if (quu['type'] === '单选题') {
                    _w.top.unrivalWorkInfo = quu['question'] + '：AI未给出答案，自动选【B】';
                    for (let y = 0, j = choiceEs.length; y < j; y++) {
                        if (choiceEs[y].getElementsByTagName('em').length < 1) continue;
                        if (choiceEs[y].getElementsByTagName('em')[0].getAttribute('id-param') == 'B' &&
                            choiceEs[y].getAttribute('id-param') == quu['questionid'].replace('answer', '')) {
                            if (!String(choiceEs[y].getAttribute('class') || '').includes('cur')) choiceEs[y].click();
                            return;
                        }
                    }
                } else if (quu['type'] === '多选题') {
                    _w.top.unrivalWorkInfo = quu['question'] + '：AI未给出答案，自动全选';
                    for (let y = 0, j = choiceEs.length; y < j; y++) {
                        if (choiceEs[y].getElementsByTagName('em').length < 1) continue;
                        if (choiceEs[y].getAttribute('id-param') == quu['questionid'].replace('answer', '')) {
                            if (!String(choiceEs[y].getAttribute('class') || '').includes('cur')) choiceEs[y].click();
                        }
                    }
                }
            },
            /* ---- 用 AI 候选答案作答；匹配失败才随机兜底 ---- */
            useAnswers = function (quu, answers) {
                var choiceEs = _d.getElementsByTagName('li');
                if (applyAnswers(quu, answers, choiceEs)) {
                    questionNum -= 1;
                    return true;
                }
                randomFallback(quu, choiceEs);
                return false;
            },
            /* ---- 作答调度：默认串行（并发=1），一道答完再发下一道 ----
             * aiMaxConcurrent 固定为 1：同一时刻只问一道题，最稳、最不容易被风控，也不会选错。
             * 每题返回后立即补发下一道；每题点击按题目自身的 id-param 精确落笔。
             */
            aiFailStreak = 0,
            aiCircuitOpen = false,
            activeCount = 0,
            maxConcurrentNow = function () {
                var n = parseInt(aiMaxConcurrent, 10);
                if (!(n >= 1)) n = 1;
                return Math.max(1, Math.min(8, n));
            },
            dispatchNext = function () {
                if (_w.top.unrivalPaused == '1') {
                    setTimeout(dispatchNext, 800);
                    return;
                }
                // 只要在途数未满且还有题，就继续派发（IIFE 同步执行，activeCount 立增，循环必然收敛）
                while (activeCount < maxConcurrentNow() && processIndex < questionList.length) {
                    (function () {
                        var quu = questionList[processIndex];
                        processIndex += 1;
                        var seq = processIndex;
                        activeCount += 1;
                        _w.top.unrivalWorkInfo = '正在作答 ' + seq + '/' + questionList.length + '（逐题串行）';
                        var settle = function () {
                            if (_w.top.unrivalPaused == '1') {
                                setTimeout(settle, 500);
                                return;
                            }
                            activeCount -= 1;
                            busyThread -= 1;
                            // 极短间隔后补发下一道（原为 0.8~2s 纯空等，是「慢」的一大来源）
                            setTimeout(dispatchNext, parseInt(Math.random() * 200 + 100, 10));
                        };
                        // 连续失败熔断：避免接口不通时，每道题都白等一个超时（30s×N）
                        if (aiCircuitOpen) {
                            _w.top.unrivalWorkInfo = '第' + seq + '题：AI 已停用（连续失败），改用兜底';
                            randomFallback(quu, _d.getElementsByTagName('li'));
                            settle();
                            return;
                        }
                        askAI(quu, function (answers, err) {
                            try {
                                if (answers && answers.length > 0) {
                                    aiFailStreak = 0;
                                    _w.top.unrivalWorkInfo = '第' + seq + '题：AI答案 ' + answers.join('#');
                                    useAnswers(quu, answers);
                                } else {
                                    aiFailStreak += 1;
                                    _w.top.unrivalWorkInfo = '第' + seq + '题：AI失败(' + (err || '未知') + ')';
                                    randomFallback(quu, _d.getElementsByTagName('li'));
                                    if (aiFailStreak >= 3 && !aiCircuitOpen) {
                                        aiCircuitOpen = true;
                                        logs.addLog('AI 连续 3 次失败，已停止后续 AI 请求以免长时间空等。请检查面板的 Key / 地址 / 模型名后刷新重试。', 'red');
                                    }
                                }
                            } finally {
                                settle();
                            }
                        });
                    })();
                }
            };
        setTimeout(dispatchNext, parseInt(Math.random() * 400 + 300, 10));
        var workInterval = setInterval(function () {
            // 暂停中：不自动提交/保存，等恢复后再判断
            if (_w.top.unrivalPaused == '1') {
                return;
            }
            if (busyThread != 0) {
                return;
            }
            clearInterval(workInterval);
            if (Math.floor((totalQuestionNum - questionNum) / totalQuestionNum) * 100 >= accuracy && _w.top
                .unrivalAutoSubmit == '1') {
                _w.top.unrivalDoneWorkId = getQueryVariable('workId');
                _w.top.unrivalWorkInfo = '正确率符合标准，已提交答案';
                setTimeout(function () {
                    submitCheckTimes();
                    escapeBlank()
                    submitAction()
                }, parseInt(Math.random() * 2000 + 3000, 10));

            } else if (_w.top.unrivalAutoSave == 1) {
                _w.top.unrivalWorkInfo = '正确率不符合标准或未设置自动提交，已自动保存答案';
                if (Math.floor((totalQuestionNum - questionNum) / totalQuestionNum) >= 0) {
                    setTimeout(function () {
                        _w.top.unrivalDoneWorkId = getQueryVariable('workId');
                        _w.noSubmit();
                    }, 2000);
                }
            } else {
                _w.top.unrivalWorkInfo = '用户设置为不自动保存答案，请手动提交或保存作业';
            }
        }, 1000);
    } else if (_l.href.includes('work/phone/selectWorkQuestionYiPiYue')) {
        _w.top.unrivalWorkDone = true;
        _w.top.unrivalDoneWorkId = getQueryVariable('workId');
    } else if (_l.href.includes('stat2-ans.chaoxing.com/task/s/index')) {
        if (_w.top == _w) {
            return;
        }
        _d.getElementsByClassName('page-container studentStatistic')[0].setAttribute('class', 'studentStatistic');
        _d.getElementsByClassName('page-item item-task-list minHeight390')[0].remove();
        _d.getElementsByClassName('subNav clearfix')[0].remove();
        setInterval(function () {
            _l.reload();
        }, 90000);
    } else if (_l.href.includes('passport2.') && _l.href.includes('login?refer=http') && autoLogin == 1) {
        if (!(/^1[3456789]\d{9}$/.test(phoneNumber))) {
            alert('自动登录的手机号填写错误，无法登陆')
            return;
        }
        if (password == '') {
            alert('未填写登录密码，无法登陆')
            return;
        }
        GM_xmlhttpRequest({
            method: "get",
            url: 'https://passport2-api.chaoxing.com/v11/loginregister?cx_xxt_passport=json&uname=' +
                phoneNumber + '&code=' + encodeURIComponent(password),
            onload: function (res) {
                try {
                    let ispass = JSON.parse(res.responseText);
                    if (ispass['status']) {
                        _l.href = decodeURIComponent(getQueryVariable('refer'));
                    } else {
                        alert(ispass['mes']);
                    }
                } catch (err) {
                    console.log(res.responseText);
                    alert('登陆失败');
                }
            },
            onerror: function (err) {
                alert('登陆错误');
            }
        });
    } else if (_l.href.includes('unrivalxxtbackground')) {
        _d.getElementsByTagName("html")[0].innerHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>学习通挂机小助手</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${UI_CSS}</style>
    </head>
    <body>
        <div class="wrap">
            <div class="topbar">
                <div class="brand">
                    <span class="brand-mark">挂</span>
                    <div>
                        <h1>学习通挂机小助手</h1>
                        <div class="brand-sub">后台自动执行任务，无需保持窗口在最前</div>
                    </div>
                </div>
                <span class="badge"><i></i>后台运行中</span>
            </div>

            <div class="grid">
                <div class="col">
                    <div class="panel">
                        <div class="panel-heading">任务列表</div>
                        <div class="panel-body">
                            <div id="joblist" class="joblist"></div>
                            <div class="empty">暂无任务</div>
                        </div>
                    </div>
                </div>
                <div class="col">
                    <div class="panel">
                        <div class="panel-heading">运行日志</div>
                        <div class="panel-body">
                            <div id="result" class="logbox"><div id="log"></div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </body>
</html>
    `;
        var logs = {
            "logArry": [],
            "addLog": function (str, color = "black") {
                if (this.logArry.length >= 50) {
                    this.logArry.splice(0, 1);
                }
                var nowTime = new Date(),
                    nowHour = (Array(2).join(0) + nowTime.getHours()).slice(-2),
                    nowMin = (Array(2).join(0) + nowTime.getMinutes()).slice(-2),
                    nowSec = (Array(2).join(0) + nowTime.getSeconds()).slice(-2),
                    logElement = _d.getElementById('log');
                this.logArry.push("<div class='log-line' style='color: " + color + "'>" +
                    "<span class='log-ts'>[" + nowHour + ":" + nowMin + ":" + nowSec + "]</span>" +
                    str + "</div>");
                if (!logElement) return;
                logElement.innerHTML = this.logArry.join('');
                // 滚动容器是外层 #result(.logbox)，对 #log 设 scrollTop 恒为 0
                var box = _d.getElementById('result') || logElement;
                box.scrollTop = box.scrollHeight;
            }
        };
        logs.addLog('此页面不必保持在最前端，后台会自动进行任务', 'green');
        setInterval(function () {
            logs.addLog('此页面不必保持在最前端，后台会自动进行任务', 'green');
            logs.addLog('如想禁用后台刷视频功能，请关闭脚本并重启浏览器', 'blue');
        }, 120000)
        GM_addValueChangeListener('unrivalxxtbackgroundinfo', function (name, old_value, new_value, remote) {
            if (old_value != new_value) {
                logs.addLog(new_value);
            }
        });
        setInterval(function () {
            if (Math.round(new Date() / 1000) - parseInt(GM_getValue('unrivalBackgroundVideoEnable', '6')) >
                15) {
                logs.addLog('超星挂机小助手可能运行异常，如页面无反应，请尝试重启脚本猫或重启浏览器(脚本猫0.9.0版本有此问题)');
            }
        }, 10000);
        var loopShow = () => {
            let jobList = GM_getValue('unrivalBackgroundList', '1');
            if (jobList == '1') {
                _d.getElementById('joblist').innerHTML =
                    '<div class="job-item"><span class="job-status">等待数据</span>' +
                    '<span class="job-name">请将“超星挂机小助手”升级到最新版并重启浏览器</span></div>';
            } else {
                try {
                    let jobHtml = '';
                    for (let i = 0, l = jobList.length; i < l; i++) {
                        let status = '', cls = '';
                        if (jobList[i]['done']) {
                            status = '已完成';
                            cls = 'is-done';
                        } else if (parseInt(jobList[i]['playTime']) > 0) {
                            status = '进行中';
                            cls = 'is-running';
                        } else {
                            status = '等待中';
                        }
                        if (jobList[i]['review']) {
                            status += ' · 复习模式';
                        }
                        jobHtml += '<div class="job-item ' + cls + '">' +
                            '<span class="job-status">' + status + '</span>' +
                            '<span class="job-name">' + jobList[i]['name'] + '</span></div>';
                    }
                    _d.getElementById('joblist').innerHTML = jobHtml;
                } catch (e) {
                    _d.getElementById('joblist').innerHTML =
                        '<div class="job-item"><span class="job-status">异常</span>' +
                        '<span class="job-name">请将“超星挂机小助手”升级到最新版并重启浏览器！</span></div>';
                }
            }
        }
        loopShow();
        setInterval(loopShow, 10000);
    } else if (_l.href.includes('/visit/stucoursemiddle')) {
        /* ===================================================================
         * 人脸验证自动通过
         * 页面：/visit/stucoursemiddle（人脸采集页）
         * 流程：二维码取参 → 取上传凭证 → 拉取本人已备案人脸照 → 像素级轻微扰动
         *      → 上传换取 objectId → 提交签到接口（失败自动重试，最多 10 次）
         * 界面沿用主面板同一套视觉语言（白底 / 浅灰描边 / 蓝色标题栏），保持风格统一。
         * =================================================================== */
        const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 12; SM-N9006 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36 (schild:a6aba57d51661f412e8b8d2177adf8b4) (device:SM-N9006) Language/zh_CN com.chaoxing.mobile/ChaoXingStudy_3_6.4.5_android_phone_10831_263 (@Kalimdor)_6e98c17c08204755905e1537b1933e72';
        const faceState = { isProcessing: false, lastQRUrl: '', lastProcessTime: 0, initialized: false };
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const faceLog = (msg, color) => safeLog(msg, color || 'black');
        const debounce = (fn, wait) => {
            let t;
            return function (...a) { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
        };

        // Cookie 缓存
        const faceCookie = {
            jar: {},
            load() {
                const jar = this.jar;
                _d.cookie.split(';').forEach(c => {
                    const i = c.indexOf('=');
                    if (i > 0) {
                        const k = c.slice(0, i).trim();
                        if (k) jar[k] = c.slice(i + 1).trim();
                    }
                });
            },
            get(k) { return this.jar[k] || null; }
        };

        // 轻量提示条：沿用主面板的浅色描边配色
        // Toast 沿用 UI_CSS 的 .toast-* 配色（与主面板 alert 语义色一致）
        const faceToast = (title, message, type) => {
            const box = _d.createElement('div');
            box.className = 'toast toast-' + (type || 'info');
            box.innerHTML = '<strong></strong><span></span>';
            box.querySelector('strong').textContent = title;
            box.querySelector('span').textContent = message;
            (_d.body || _d.documentElement).appendChild(box);
            setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 5000);
        };

        let faceSetStatus = () => { };

        // 二维码参数提取
        class FaceQRExtractor {
            extractQRUrl() {
                const img = _d.getElementById('fcqrimg');
                return img && img.src ? img.src : null;
            }
            parseUrlParams(url) {
                const params = {};
                try {
                    const u = new _w.URL(url, _w.location.origin);
                    u.searchParams.forEach((v, k) => { params[k] = v; });
                    if (params.content) {
                        try {
                            const inner = new _w.URL(decodeURIComponent(params.content));
                            inner.searchParams.forEach((v, k) => { params[k] = v; });
                        } catch (e) { }
                    }
                } catch (e) { }
                return params;
            }
            extractHiddenFields() {
                const fields = {}, inputs = _d.querySelectorAll('input[type="hidden"]');
                for (let i = 0; i < inputs.length; i++) {
                    if (inputs[i].id && inputs[i].value) fields[inputs[i].id] = inputs[i].value;
                }
                return fields;
            }
            getAllParams() {
                const qrUrl = this.extractQRUrl();
                if (!qrUrl) return null;
                if (qrUrl === faceState.lastQRUrl) return null;   // 同一二维码不重复处理
                faceState.lastQRUrl = qrUrl;
                const qr = this.parseUrlParams(qrUrl), hid = this.extractHiddenFields();
                const cur = new _w.URLSearchParams(_w.location.search);
                return Object.assign({}, qr, hid, {
                    courseid: hid.curCourseId || qr.courseid || cur.get('courseid'),
                    clazzid: hid.curClazzId || qr.clazzid || cur.get('clazzid'),
                    cpi: hid.curCpi || qr.cpi || cur.get('cpi'),
                    knowledgeid: hid.curChapterId || qr.knowledgeid || cur.get('knowledgeid')
                });
            }
        }

        // 接口签名
        const addInfEncSign = params => {
            if (!params) return {};
            const q = Object.keys(params)
                .filter(k => params[k] !== undefined && params[k] !== null)
                .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
                .join('&') + '&DESKey=Z(AfY@XS';
            return Object.assign({}, params, { inf_enc: CryptoJS.MD5(q).toString() });
        };

        // 上传凭证
        const getUploadToken = () => new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://pan-yz.chaoxing.com/api/token/uservalid',
                headers: { 'User-Agent': MOBILE_UA, 'Accept': 'application/json, text/plain, */*', 'Referer': _w.location.href },
                onload(r) {
                    try {
                        if (r.status !== 200) throw new Error('请求失败: ' + r.status);
                        const d = JSON.parse(r.responseText);
                        if (d && d._token) resolve(d._token);
                        else reject(new Error('响应中缺少 _token'));
                    } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('凭证请求失败'))
            });
        });

        // 拉取本人已备案的人脸照
        const getFaceImage = puid => new Promise((resolve, reject) => {
            const signed = addInfEncSign({
                enc: CryptoJS.MD5(puid + 'uWwjeEKsri').toString(),
                token: '4faa8662c59590c6f43ae9fe5b002b42',
                _time: Date.now()
            });
            const qs = Object.keys(signed)
                .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(signed[k])).join('&');
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://passport2-api.chaoxing.com/api/getUserFaceid?' + qs,
                headers: { 'User-Agent': MOBILE_UA, 'Accept': 'application/json, text/plain, */*', 'Referer': _w.location.href },
                onload(r) {
                    try {
                        if (r.status !== 200) throw new Error('请求失败: ' + r.status);
                        const d = JSON.parse(r.responseText);
                        if (!(d && d.result === 1 && d.data && d.data.http)) {
                            reject(new Error((d && d.msg) || '获取人脸图片地址失败'));
                            return;
                        }
                        GM_xmlhttpRequest({
                            method: 'GET', url: d.data.http, responseType: 'arraybuffer',
                            onload(ir) {
                                if (ir.status === 200 && ir.response) resolve(ir.response);
                                else reject(new Error('获取人脸图片失败: ' + ir.status));
                            },
                            onerror: () => reject(new Error('获取人脸图片失败'))
                        });
                    } catch (e) { reject(e); }
                },
                onerror: () => reject(new Error('人脸图片地址请求失败'))
            });
        });

        // 像素级轻微扰动（极小幅噪声，不改变可识别特征）
        const processImage = bytes => new Promise((resolve, reject) => {
            if (!bytes || bytes.byteLength === 0) { reject(new Error('图片数据为空')); return; }
            const img = new _w.Image();
            const objUrl = _w.URL.createObjectURL(new _w.Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
            img.onload = () => {
                try {
                    const cv = _d.createElement('canvas'), ctx = cv.getContext('2d');
                    cv.width = img.width;
                    cv.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    const data = ctx.getImageData(0, 0, cv.width, cv.height), px = data.data;
                    for (let i = 0; i < Math.min(15, px.length / 100); i++) {
                        const x = Math.floor(Math.random() * img.width) * 4;
                        const c = Math.floor(Math.random() * 3);
                        const d = Math.floor(Math.random() * 5) - 2;
                        px[x + c] = Math.max(0, Math.min(255, px[x + c] + d));
                    }
                    ctx.putImageData(data, 0, 0);
                    cv.toBlob(blob => {
                        if (!blob) { reject(new Error('无法生成图片')); return; }
                        const fr = new _w.FileReader();
                        fr.onload = e => resolve(new Uint8Array(e.target.result));
                        fr.onerror = () => reject(new Error('读取图片失败'));
                        fr.readAsArrayBuffer(blob);
                    }, 'image/jpeg', 0.8);
                } catch (e) { reject(e); } finally { _w.URL.revokeObjectURL(objUrl); }
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = objUrl;
        });

        // 上传换取 objectId
        const uploadFaceImage = (bytes, puid, token) => new Promise((resolve, reject) => {
            const fd = new _w.FormData();
            fd.append('file', new _w.Blob([bytes], { type: 'image/jpeg' }), puid + '.jpg');
            fd.append('puid', puid);
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://pan-yz.chaoxing.com/upload?uploadtype=face&_token=' + token,
                data: fd,
                headers: { 'User-Agent': MOBILE_UA, 'Accept': 'application/json, text/plain, */*', 'Referer': _w.location.href },
                onload(r) {
                    try {
                        const d = JSON.parse(r.responseText);
                        if (d && d.objectId) resolve(d.objectId);
                        else reject(new Error((d && d.message) || '上传未返回 objectId'));
                    } catch (e) { reject(new Error('解析上传响应失败')); }
                },
                onerror: () => reject(new Error('图片上传请求失败'))
            });
        });

        // 提交签到
        const submitSign = (params, objectId, retryCount = 0) => {
            const maxRetries = 10, retryDelay = 5000;
            const url = 'https://mooc1-api.chaoxing.com/mooc-ans/qr/updateqrstatus?uuid2=' +
                params.uuid + '&clazzId2=' + params.clazzid;
            const fd = new _w.FormData();
            fd.append('clazzId', params.clazzid);
            fd.append('courseId', params.courseid);
            fd.append('uuid', params.uuid);
            fd.append('qrcEnc', params.qrcEnc);
            fd.append('cpi', params.cpi);
            fd.append('liveDetectionStatus', '1');
            fd.append('objectId', objectId);
            fd.append('knowledgeid', params.knowledgeid || '0');
            ['signt', 'signk', 'cxtime', 'cxcid', 'videojobid'].forEach(k => fd.append(k, params[k] || ''));
            fd.append('videoCollectTime', params.realCollectTime || '0');
            fd.append('chaptervideoobjectid', params.chaptervideoobjectid || '');

            const retry = async () => {
                if (retryCount >= maxRetries) {
                    faceState.isProcessing = false;
                    faceSetStatus('已达最大重试次数，验证失败', '#c0392b');
                    faceToast('验证失败', '已达到最大重试次数', 'error');
                    return;
                }
                faceSetStatus((retryDelay / 1000) + ' 秒后第 ' + (retryCount + 1) + ' 次重试…', '#b45309');
                await sleep(retryDelay);
                try {
                    const puid = faceCookie.get('_uid');
                    if (!puid) throw new Error('未获取到用户 ID，请重新登录');
                    const token = await getUploadToken();
                    const raw = await getFaceImage(puid);
                    const proc = await processImage(raw);
                    const newId = await uploadFaceImage(proc, puid, token);
                    submitSign(params, newId, retryCount + 1);
                } catch (e) {
                    faceLog('重试失败：' + e.message, 'red');
                    submitSign(params, objectId, retryCount + 1);
                }
            };

            GM_xmlhttpRequest({
                method: 'POST', url: url, data: fd,
                headers: {
                    'User-Agent': MOBILE_UA, 'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest', 'Referer': _w.location.href
                },
                onload(r) {
                    try {
                        const d = JSON.parse(r.responseText);
                        if (d && d.code === 0 && d.status === true && d.msg === '通过') {
                            faceState.isProcessing = false;
                            faceSetStatus('人脸验证已通过', '#16803c');
                            faceToast('验证通过', '人脸验证成功完成', 'success');
                            faceLog('人脸验证通过', 'green');
                            return;
                        }
                        if (d && d.code === -4) {
                            faceState.isProcessing = false;
                            faceSetStatus('权限不足，请重新登录', '#c0392b');
                            faceToast('验证失败', d.msg || '权限不足', 'error');
                            return;
                        }
                        faceLog('人脸失败：' + ((d && (d.message || d.msg)) || '未知错误'), 'red');
                        faceSetStatus('验证失败，准备重试…', '#c0392b');
                        faceToast('验证失败', (d && (d.message || d.msg)) || '未知错误', 'warning');
                        retry();
                    } catch (e) {
                        if (r.responseText && r.responseText.indexOf('网页解析失败') >= 0) {
                            faceState.isProcessing = false;
                            faceSetStatus('服务器解析失败', '#c0392b');
                            faceToast('验证失败', '服务器解析失败，参数可能有误', 'error');
                            return;
                        }
                        retry();
                    }
                },
                onerror() { retry(); }
            });
        };

        // 主流程
        const autoProcessFace = async () => {
            if (faceState.isProcessing) return;
            faceState.isProcessing = true;
            faceSetStatus('开始处理…', '#2f6fed');
            try {
                faceCookie.load();
                const puid = faceCookie.get('_uid');
                if (!puid) throw new Error('未获取到用户 ID，请重新登录');

                let params = new FaceQRExtractor().getAllParams();
                if (!params) {
                    try {
                        const cached = _w.localStorage.getItem('faceLastParams');
                        if (cached) params = JSON.parse(cached);
                    } catch (e) { }
                }
                if (!params) {
                    await sleep(2000);
                    params = new FaceQRExtractor().getAllParams();
                }
                if (!params) throw new Error('未能提取到二维码参数');
                try { _w.localStorage.setItem('faceLastParams', JSON.stringify(params)); } catch (e) { }

                const missing = ['courseid', 'clazzid', 'cpi', 'uuid'].filter(k => !params[k]);
                if (missing.length) throw new Error('缺少必要参数：' + missing.join(', '));

                faceSetStatus('获取上传凭证…', '#2f6fed');
                const token = await getUploadToken();
                faceSetStatus('拉取人脸照片…', '#2f6fed');
                const raw = await getFaceImage(puid);
                faceSetStatus('处理照片…', '#2f6fed');
                const proc = await processImage(raw);
                faceSetStatus('上传照片…', '#2f6fed');
                const objectId = await uploadFaceImage(proc, puid, token);
                faceSetStatus('提交验证…', '#2f6fed');
                submitSign(params, objectId);
            } catch (e) {
                faceState.isProcessing = false;
                faceSetStatus('处理失败：' + e.message, '#c0392b');
                faceToast('处理失败', e.message, 'error');
                faceLog('人脸处理失败：' + e.message, 'red');
            }
        };

        // 控制面板（沿用主面板同一套视觉语言）
        const createFacePanel = () => {
            if (_d.getElementById('facePanel')) return;
            const wrap = _d.createElement('div');
            wrap.id = 'facePanel';
            wrap.className = 'face-panel';
            wrap.innerHTML =
                '<div class="face-card">' +
                    '<div id="faceTitle" class="face-title">人脸验证自动通过</div>' +
                    '<div class="face-body">' +
                        '<div id="faceStatus" class="face-status">正在等待人脸验证弹窗…</div>' +
                        '<div class="btnrow" style="margin-top:10px">' +
                            '<a id="faceExtractBtn" href="javascript:void(0)" class="btn btn-default">提取参数</a>' +
                            '<a id="faceProcessBtn" href="javascript:void(0)" class="btn btn-primary">手动处理</a>' +
                        '</div>' +
                        '<pre id="faceParams" class="face-pre"></pre>' +
                    '</div>' +
                '</div>';
            (_d.body || _d.documentElement).appendChild(wrap);
            // 面板样式来自 UI_CSS，需注入一次（人脸页本身没有这份样式表）
            if (!_d.getElementById('cxUiStyle')) {
                const st = _d.createElement('style');
                st.id = 'cxUiStyle';
                st.textContent = UI_CSS_WIDGET;
                (_d.head || _d.documentElement).appendChild(st);
            }

            faceSetStatus = (txt, color) => {
                const el = _d.getElementById('faceStatus');
                if (el) { el.textContent = txt; el.style.color = color || '#666'; }
            };

            // 标题栏拖拽
            const title = _d.getElementById('faceTitle');
            let dragging = false, ox = 0, oy = 0;
            const onDown = e => {
                dragging = true;
                const p = e.touches ? e.touches[0] : e;
                ox = p.clientX - wrap.offsetLeft;
                oy = p.clientY - wrap.offsetTop;
            };
            const onMove = e => {
                if (!dragging) return;
                e.preventDefault();
                const p = e.touches ? e.touches[0] : e;
                wrap.style.right = 'auto';   // 拖拽改用 left 定位，先解除 right 以免两者冲突
                wrap.style.left = Math.max(0, Math.min(p.clientX - ox, _w.innerWidth - wrap.offsetWidth)) + 'px';
                wrap.style.top = Math.max(0, Math.min(p.clientY - oy, _w.innerHeight - wrap.offsetHeight)) + 'px';
            };
            const onUp = () => { dragging = false; };
            title.addEventListener('mousedown', onDown);
            _d.addEventListener('mousemove', onMove);
            _d.addEventListener('mouseup', onUp);
            title.addEventListener('touchstart', onDown);
            _d.addEventListener('touchmove', onMove);
            _d.addEventListener('touchend', onUp);

            _d.getElementById('faceExtractBtn').onclick = () => {
                const params = new FaceQRExtractor().getAllParams();
                const box = _d.getElementById('faceParams');
                if (params) {
                    box.textContent = JSON.stringify(params, null, 2);
                    box.style.display = 'block';
                    faceToast('提取成功', '参数已显示在面板中', 'success');
                } else {
                    box.textContent = '未找到新的二维码参数';
                    box.style.display = 'block';
                    faceToast('提取失败', '未找到新的二维码参数', 'warning');
                }
            };
            _d.getElementById('faceProcessBtn').onclick = () => {
                if (faceState.isProcessing) { faceToast('处理中', '正在处理，请稍候', 'warning'); return; }
                autoProcessFace();
            };
        };

        // 检测人脸验证页
        const detectFace = debounce(() => {
            if (faceState.isProcessing) return;
            const now = Date.now();
            if (now - faceState.lastProcessTime < 3000) return;
            faceState.lastProcessTime = now;
            faceLog('检测到人脸验证页面，开始自动处理', 'blue');
            faceToast('已检测到人脸验证', '正在自动处理，请稍候…', 'info');
            setTimeout(autoProcessFace, 2000);
        }, 1000);

        // 初始化
        const faceInit = () => {
            if (faceState.initialized) return;
            faceState.initialized = true;
            createFacePanel();
            // crypto-js 由 @require 从 CDN 加载；若被网络策略拦截则签名无法生成，
            // 这里显式提示，避免"面板在但点了没反应"的静默失效。
            if (typeof CryptoJS === 'undefined') {
                faceSetStatus('crypto-js 未加载，功能不可用', '#c0392b');
                faceToast('依赖缺失', 'crypto-js 未加载成功，请检查网络后刷新', 'error');
                faceLog('人脸功能所需的 crypto-js 未加载成功，本页功能已停用', 'orange');
                return;
            }
            faceLog('人脸验证自动通过已启动', 'green');
            try {
                const observer = new _w.MutationObserver(detectFace);
                observer.observe(_d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
            } catch (e) { }
            setInterval(() => { if (!faceState.isProcessing) detectFace(); }, 5000);
            detectFace();
        };

        if (_d.readyState === 'loading') {
            _d.addEventListener('DOMContentLoaded', faceInit);
        } else {
            faceInit();
        }
    }
})();