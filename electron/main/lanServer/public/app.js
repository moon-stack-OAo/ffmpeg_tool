/* 轻影局域网远程页 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const viewLogin = $('view-login')
  const viewMain = $('view-main')
  const loginForm = $('login-form')
  const loginError = $('login-error')
  const loginBtn = $('login-btn')
  const whoami = $('whoami')
  const uploadForm = $('upload-form')
  const uploadError = $('upload-error')
  const uploadHint = $('upload-hint')
  const uploadBtn = $('upload-btn')
  const uploadProgress = $('upload-progress')
  const uploadProgressInner = $('upload-progress-inner')
  const fileInput = $('file-input')
  const fileName = $('file-name')
  const dropzone = $('dropzone')
  const taskBody = $('task-body')
  const optMode = $('opt-mode')
  const optPreset = $('opt-preset')
  const wrapFormat = $('wrap-format')
  const wrapMaxedge = $('wrap-maxedge')
  const wrapAformat = $('wrap-aformat')
  const wrapAbitrate = $('wrap-abitrate')
  const customOpts = $('custom-opts')
  const presetHint = $('preset-hint')
  const optCrf = $('opt-crf')
  const optTarget = $('opt-target')
  const optMaxedge = $('opt-maxedge')
  const optFormat = $('opt-format')

  /** 预设默认值（与 shared DEFAULT_PRESETS 对齐） */
  const PRESET_DEFAULTS = {
    archive: { crf: 18, maxEdge: 0, format: 'mp4', label: 'CRF 18 · 原分辨率 · 画质优先' },
    standard: { crf: 23, maxEdge: 0, format: 'mp4', label: 'CRF 23 · 原分辨率 · 均衡' },
    social: { crf: 28, maxEdge: 1280, format: 'mp4', label: 'CRF 28 · 最长边 1280 · 更小体积' },
    custom: { crf: 23, maxEdge: 0, format: 'mp4', label: '手动设置 CRF、分辨率与格式' }
  }

  const FILE_PLACEHOLDER = '点击或拖拽文件到此处'
  let pollTimer = null
  let authenticated = false

  function updateStats(tasks) {
    const list = tasks || []
    const total = list.length
    let active = 0
    let done = 0
    let fail = 0
    for (const t of list) {
      if (t.status === 'running' || t.status === 'queued' || t.status === 'pending') active++
      else if (t.status === 'completed') done++
      else if (t.status === 'failed') fail++
    }
    const set = (id, n) => {
      const el = $(id)
      if (el) el.textContent = String(n)
    }
    set('stat-total', total)
    set('stat-active', active)
    set('stat-done', done)
    set('stat-fail', fail)
  }

  function showLogin() {
    authenticated = false
    viewLogin.hidden = false
    viewMain.hidden = true
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function showMain(username) {
    authenticated = true
    viewLogin.hidden = true
    viewMain.hidden = false
    whoami.textContent = username ? username : '已登录'
    whoami.title = username ? `已登录：${username}` : '已登录'
    syncModeUi()
    void loadTasks()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      void loadTasks()
    }, 2000)
  }

  function setFileLabel(file) {
    if (file) {
      fileName.textContent = file.name
      dropzone.classList.add('has-file')
    } else {
      fileName.textContent = FILE_PLACEHOLDER
      dropzone.classList.remove('has-file')
    }
  }

  function syncModeUi() {
    const audio = optMode.value === 'audio'
    const custom = optPreset.value === 'custom'
    wrapFormat.hidden = audio
    wrapMaxedge.hidden = audio
    wrapAformat.hidden = !audio
    wrapAbitrate.hidden = !audio
    // 自定义高级区：仅视频压缩 + 自定义预设
    if (customOpts) {
      customOpts.hidden = audio || !custom
    }
    const def = PRESET_DEFAULTS[optPreset.value] || PRESET_DEFAULTS.standard
    if (presetHint) {
      if (audio) {
        presetHint.textContent = '音频模式仅抽取音轨，忽略视频预设画质参数'
      } else if (custom) {
        presetHint.textContent = def.label + ' · 下方可改 CRF / 目标体积'
      } else {
        presetHint.textContent = def.label
      }
    }
  }

  /** 切换预设时填入默认 CRF / 最长边 / 格式（自定义也给一组起点值） */
  function applyPresetDefaults() {
    const def = PRESET_DEFAULTS[optPreset.value] || PRESET_DEFAULTS.standard
    if (optCrf) optCrf.value = String(def.crf)
    if (optMaxedge) optMaxedge.value = String(def.maxEdge)
    if (optFormat && def.format) optFormat.value = def.format
    if (optTarget && optPreset.value !== 'custom') optTarget.value = '0'
    syncModeUi()
  }

  async function api(path, options) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options
    })
    const ct = res.headers.get('content-type') || ''
    let data = null
    if (ct.includes('application/json')) {
      data = await res.json()
    }
    return { res, data }
  }

  async function checkStatus() {
    try {
      const { data } = await api('/api/status')
      if (data && data.ok) {
        if (data.maxUploadMb) {
          uploadHint.textContent = `单文件上限约 ${data.maxUploadMb} MB；编码器与输出目录使用本机设置`
        }
        if (data.authenticated) {
          showMain(data.username)
        } else {
          showLogin()
        }
      }
    } catch {
      showLogin()
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    loginError.hidden = true
    loginBtn.disabled = true
    try {
      const username = $('login-user').value.trim()
      const password = $('login-pass').value
      const { res, data } = await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (!res.ok || !data || !data.ok) {
        loginError.textContent =
          (data && data.error) || `登录失败 (${res.status})`
        loginError.hidden = false
        return
      }
      $('login-pass').value = ''
      showMain(data.username || username)
    } catch (err) {
      loginError.textContent = err.message || '网络错误'
      loginError.hidden = false
    } finally {
      loginBtn.disabled = false
    }
  })

  $('btn-logout').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    showLogin()
  })

  optMode.addEventListener('change', syncModeUi)
  optPreset.addEventListener('change', applyPresetDefaults)

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0]
    setFileLabel(f || null)
  })

  ;['dragenter', 'dragover'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropzone.classList.add('is-dragover')
    })
  })
  ;['dragleave', 'drop'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault()
      e.stopPropagation()
      dropzone.classList.remove('is-dragover')
    })
  })
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files
    if (files && files.length) {
      fileInput.files = files
      setFileLabel(files[0])
    }
  })

  function formatSize(bytes) {
    if (bytes == null || !Number.isFinite(bytes)) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  function statusLabel(s) {
    const map = {
      pending: '待处理',
      queued: '排队中',
      running: '进行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    }
    return map[s] || s
  }

  function progressValue(t) {
    if (t.status === 'completed') return 100
    if (typeof t.progress === 'number' && Number.isFinite(t.progress)) {
      return Math.max(0, Math.min(100, t.progress))
    }
    if (t.status === 'queued' || t.status === 'pending') return 0
    return null
  }

  function renderTasks(tasks) {
    updateStats(tasks)
    if (!tasks || tasks.length === 0) {
      taskBody.innerHTML = `<tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon" aria-hidden="true">◇</div>
            <p>暂无任务</p>
            <span class="muted">从左侧投递文件后显示在这里</span>
          </div>
        </td>
      </tr>`
      return
    }
    taskBody.innerHTML = tasks
      .map((t) => {
        const pv = progressValue(t)
        const pctText =
          pv == null ? '—' : (t.status === 'completed' ? '100%' : pv.toFixed(1) + '%')
        const fillW = pv == null ? 0 : pv
        const size =
          t.status === 'completed' && t.outputSize != null
            ? formatSize(t.outputSize)
            : formatSize(t.inputSize)
        const err =
          t.error && t.status === 'failed'
            ? `<div class="task-file-err">${escapeHtml(t.error)}</div>`
            : ''
        const dl = t.downloadable
          ? `<a class="btn sm primary" href="/api/tasks/${encodeURIComponent(t.id)}/download">下载</a>`
          : '<span class="muted">—</span>'
        return `<tr>
          <td>
            <div class="task-file">
              <div class="task-file-name" title="${escapeHtml(t.fileName || t.id)}">${escapeHtml(t.fileName || t.id)}</div>
              ${err}
            </div>
          </td>
          <td><span class="status ${escapeHtml(t.status)}">${statusLabel(t.status)}</span></td>
          <td class="pct-cell">
            <div class="pct-wrap">
              <span class="pct-text">${pctText}</span>
              <div class="pct-track"><div class="pct-fill${t.status === 'completed' ? ' is-done' : ''}" style="width:${fillW}%"></div></div>
            </div>
          </td>
          <td class="size-cell">${size}</td>
          <td class="col-action">${dl}</td>
        </tr>`
      })
      .join('')
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  async function loadTasks() {
    if (!authenticated) return
    try {
      const { res, data } = await api('/api/tasks')
      if (res.status === 401) {
        showLogin()
        return
      }
      if (data && data.ok) {
        renderTasks(data.tasks || [])
      }
    } catch {
      // 静默
    }
  }

  $('btn-refresh').addEventListener('click', () => {
    void loadTasks()
  })

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault()
    uploadError.hidden = true
    const file = fileInput.files && fileInput.files[0]
    if (!file) {
      uploadError.textContent = '请选择文件'
      uploadError.hidden = false
      return
    }

    const options = {
      mode: optMode.value,
      presetId: optPreset.value,
      format: optFormat.value,
      maxEdge: Number(optMaxedge.value) || 0,
      audioFormat: $('opt-aformat').value,
      audioBitrate: $('opt-abitrate').value
    }
    if (optPreset.value === 'custom' && optMode.value !== 'audio') {
      options.crf = Number(optCrf.value)
      if (!Number.isFinite(options.crf)) options.crf = 23
      const target = Number(optTarget.value) || 0
      if (target > 0) options.targetSizeMb = target
    }

    const fd = new FormData()
    fd.append('file', file, file.name)
    fd.append('options', JSON.stringify(options))

    uploadBtn.disabled = true
    uploadProgress.hidden = false
    uploadProgressInner.style.width = '0%'

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/tasks')
    xhr.withCredentials = true

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const p = Math.round((ev.loaded / ev.total) * 100)
        uploadProgressInner.style.width = p + '%'
      }
    }

    xhr.onload = () => {
      uploadBtn.disabled = false
      uploadProgress.hidden = true
      try {
        const data = JSON.parse(xhr.responseText || '{}')
        if (xhr.status === 401) {
          showLogin()
          return
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          fileInput.value = ''
          setFileLabel(null)
          void loadTasks()
        } else {
          uploadError.textContent = data.error || '上传失败'
          uploadError.hidden = false
        }
      } catch {
        uploadError.textContent = '上传响应无效'
        uploadError.hidden = false
      }
    }

    xhr.onerror = () => {
      uploadBtn.disabled = false
      uploadProgress.hidden = true
      uploadError.textContent = '网络错误'
      uploadError.hidden = false
    }

    xhr.send(fd)
  })

  void checkStatus()
})()
