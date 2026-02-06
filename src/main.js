import './style.css'
import {
  getActiveCreators,
  getArchivedCreators,
  addCreator,
  updateCreator,
  getCreatorStatus,
  setCreatorStatus,
  checkAndResetIfNeeded,
  resetAllStatus,
  setPendingCreatorId,
  getPendingCreatorId,
  clearPendingCreatorId,
  parseNoteUrl,
  reorderCreators,
} from './storage.js'
import { fetchCreator } from './api.js'

// --- DOM refs ---
const $ = (id) => document.getElementById(id)

const checklist = $('checklist')
const emptyState = $('emptyState')
const progressText = $('progressText')

// Registration modal
const registerModal = $('registerModal')
const noteUrlInput = $('noteUrlInput')
const urlError = $('urlError')
const registerPreview = $('registerPreview')
const previewUsername = $('previewUsername')
const displayNameInput = $('displayNameInput')
const registerConfirmBtn = $('registerConfirmBtn')

// Status modal
const statusModal = $('statusModal')
const statusCreatorInfo = $('statusCreatorInfo')

// Edit modal
const editModal = $('editModal')
const editNameInput = $('editNameInput')

// Settings modal
const settingsModal = $('settingsModal')
const archivedList = $('archivedList')

let currentEditId = null
let currentStatusId = null

// --- Render ---

function render() {
  const creators = getActiveCreators()

  // Progress
  let readCount = 0
  let commentedCount = 0
  creators.forEach((c) => {
    const s = getCreatorStatus(c.id)
    if (s.read) readCount++
    if (s.commented) commentedCount++
  })

  const now = new Date()
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${['日','月','火','水','木','金','土'][now.getDay()]})`

  if (creators.length > 0) {
    progressText.textContent = `推しクリエイター ${dateStr} - ${readCount}/${creators.length} 読了, ${commentedCount}/${creators.length} コメント`
  } else {
    progressText.textContent = `推しクリエイター ${dateStr}`
  }

  // Checklist
  const existingItems = checklist.querySelectorAll('.creator-item')
  existingItems.forEach((el) => el.remove())

  if (creators.length === 0) {
    emptyState.hidden = false
    return
  }

  emptyState.hidden = true

  creators.forEach((creator) => {
    const status = getCreatorStatus(creator.id)
    const done = status.read || status.commented

    const item = document.createElement('div')
    item.className = 'creator-item'

    const tags = []
    if (status.read) tags.push('<span class="tag tag-read">読んだ</span>')
    if (status.commented) tags.push('<span class="tag tag-commented">コメント</span>')

    item.innerHTML = `
      <div class="creator-icon ${done ? 'creator-icon--done' : ''}">${
        creator.iconUrl
          ? `<img src="${encodeURI(creator.iconUrl)}" alt="" />`
          : '👤'
      }</div>
      <div class="creator-info">
        <span class="creator-name">${escapeHtml(creator.name)}${creator.hasNew ? ' <span class="badge-new">NEW</span>' : ''}</span>
        <div class="creator-tags">${tags.length ? tags.join('') : '<span class="tag tag-unread">未読</span>'}</div>
      </div>
      <button class="creator-edit-btn" data-edit="${creator.id}" aria-label="編集">⋮</button>
    `

    // Tap on tags → open status modal
    item.querySelector('.creator-tags').addEventListener('click', (e) => {
      e.stopPropagation()
      openStatusModal(creator)
    })

    // Tap on rest of item → navigate to note
    item.addEventListener('click', (e) => {
      if (e.target.closest('.creator-edit-btn')) return
      if (e.target.closest('.creator-tags')) return
      navigateToCreator(creator)
    })

    // Edit button
    item.querySelector('.creator-edit-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      openEditModal(creator)
    })

    checklist.appendChild(item)
  })
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// --- Navigation ---

function navigateToCreator(creator) {
  setPendingCreatorId(creator.id)
  window.open(creator.url, '_blank')
}

// --- Return detection ---

function handleReturn() {
  const pendingId = getPendingCreatorId()
  if (!pendingId) return

  const creators = getActiveCreators()
  const creator = creators.find((c) => c.id === pendingId)
  if (!creator) {
    clearPendingCreatorId()
    return
  }

  clearPendingCreatorId()
  openStatusModal(creator)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkAndResetIfNeeded()
    handleReturn()
    render()
  }
})

window.addEventListener('focus', () => {
  handleReturn()
})

// --- Modals ---

function openModal(overlay) {
  overlay.classList.add('active')
}

function closeModal(overlay) {
  overlay.classList.remove('active')
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay)
  })
})

// iOS keyboard: scroll focused input into view
if (visualViewport) {
  visualViewport.addEventListener('resize', () => {
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
    }
  })
}

// -- Registration modal --

$('addBtn').addEventListener('click', () => {
  noteUrlInput.value = ''
  urlError.textContent = ''
  registerPreview.hidden = true
  registerConfirmBtn.disabled = true
  openModal(registerModal)
})

noteUrlInput.addEventListener('input', () => {
  const url = noteUrlInput.value.trim()
  urlError.textContent = ''
  registerPreview.hidden = true
  registerConfirmBtn.disabled = true

  if (!url) return

  const username = parseNoteUrl(url)
  if (!username) {
    urlError.textContent = 'noteのURLを入力してください'
    return
  }

  previewUsername.textContent = username
  displayNameInput.value = username
  registerPreview.hidden = false
  registerConfirmBtn.disabled = false
})

$('registerCancelBtn').addEventListener('click', () => closeModal(registerModal))

registerConfirmBtn.addEventListener('click', async () => {
  const url = noteUrlInput.value.trim()
  const username = parseNoteUrl(url)
  if (!username) return

  const displayName = displayNameInput.value.trim() || username
  const result = addCreator(username, displayName)
  if (!result) {
    urlError.textContent = 'このクリエイターは既に登録されています'
    return
  }

  closeModal(registerModal)
  render()

  // バックグラウンドでAPI取得
  try {
    const profile = await fetchCreator(username)
    updateCreator(result.id, {
      iconUrl: profile.profileImageUrl,
      name: displayName === username ? profile.nickname || username : displayName,
      lastKnownArticleCount: profile.noteCount,
      lastCheckedAt: new Date().toISOString(),
    })
    render()
  } catch {
    // API失敗時はローカルデータのまま
  }
})

// -- Status modal --

function openStatusModal(creator) {
  currentStatusId = creator.id
  const current = getCreatorStatus(creator.id)
  statusCreatorInfo.innerHTML = `
    <div class="creator-icon">${
      creator.iconUrl
        ? `<img src="${creator.iconUrl}" alt="" />`
        : '👤'
    }</div>
    <span>${escapeHtml(creator.name)}</span>
  `
  $('statusReadCheck').checked = current.read
  $('statusCommentedCheck').checked = current.commented
  openModal(statusModal)
}

$('statusConfirmBtn').addEventListener('click', async () => {
  if (currentStatusId) {
    setCreatorStatus(currentStatusId, {
      read: $('statusReadCheck').checked,
      commented: $('statusCommentedCheck').checked,
    })
    // 新着バッジクリア + 記事数更新
    const creator = getActiveCreators().find((c) => c.id === currentStatusId)
    if (creator) {
      const updates = { hasNew: false }
      try {
        const profile = await fetchCreator(creator.username)
        updates.lastKnownArticleCount = profile.noteCount
      } catch {
        // API失敗時は記事数更新スキップ
      }
      updateCreator(currentStatusId, updates)
    }
    currentStatusId = null
    closeModal(statusModal)
    render()
  }
})

$('statusCancelBtn').addEventListener('click', () => {
  currentStatusId = null
  closeModal(statusModal)
})

// -- Edit modal --

function openEditModal(creator) {
  currentEditId = creator.id
  editNameInput.value = creator.name
  $('editArchiveBtn').textContent = 'アーカイブ'
  openModal(editModal)
}

$('editSaveBtn').addEventListener('click', () => {
  if (!currentEditId) return
  const name = editNameInput.value.trim()
  if (name) {
    updateCreator(currentEditId, { name })
  }
  currentEditId = null
  closeModal(editModal)
  render()
})

$('editArchiveBtn').addEventListener('click', () => {
  if (!currentEditId) return
  updateCreator(currentEditId, { archived: true })
  currentEditId = null
  closeModal(editModal)
  render()
})

$('editCancelBtn').addEventListener('click', () => {
  currentEditId = null
  closeModal(editModal)
})

// -- Settings modal --

$('settingsBtn').addEventListener('click', () => {
  renderOrderList()
  renderArchivedList()
  openModal(settingsModal)
})

$('settingsCloseBtn').addEventListener('click', () => closeModal(settingsModal))

$('resetBtn').addEventListener('click', () => {
  resetAllStatus()
  render()
  closeModal(settingsModal)
})

const orderList = $('orderList')

function renderOrderList() {
  const creators = getActiveCreators()
  if (creators.length === 0) {
    orderList.innerHTML = '<p class="archived-empty">なし</p>'
    return
  }

  orderList.innerHTML = creators
    .map(
      (c, i) => `
    <div class="order-item">
      <span class="order-name">${escapeHtml(c.name)}</span>
      <div class="order-btns">
        <button class="order-btn" data-move-up="${c.id}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="order-btn" data-move-down="${c.id}" ${i === creators.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
    </div>
  `
    )
    .join('')

  orderList.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ids = getActiveCreators().map((c) => c.id)
      const idx = ids.indexOf(btn.dataset.moveUp)
      if (idx > 0) {
        ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
        reorderCreators(ids)
        renderOrderList()
        render()
      }
    })
  })

  orderList.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ids = getActiveCreators().map((c) => c.id)
      const idx = ids.indexOf(btn.dataset.moveDown)
      if (idx < ids.length - 1) {
        ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
        reorderCreators(ids)
        renderOrderList()
        render()
      }
    })
  })
}

function renderArchivedList() {
  const archived = getArchivedCreators()
  if (archived.length === 0) {
    archivedList.innerHTML = '<p class="archived-empty">なし</p>'
    return
  }

  archivedList.innerHTML = archived
    .map(
      (c) => `
    <div class="archived-item">
      <span>${escapeHtml(c.name)}</span>
      <button class="btn btn-primary" data-restore="${c.id}">復帰</button>
    </div>
  `
    )
    .join('')

  archivedList.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.addEventListener('click', () => {
      updateCreator(btn.dataset.restore, { archived: false })
      renderArchivedList()
      render()
    })
  })
}

// --- Refresh from API ---

async function refreshAllCreators() {
  const creators = getActiveCreators()
  for (const creator of creators) {
    try {
      const profile = await fetchCreator(creator.username)
      const updates = {
        iconUrl: profile.profileImageUrl,
        lastCheckedAt: new Date().toISOString(),
      }
      if (creator.lastKnownArticleCount !== null && profile.noteCount > creator.lastKnownArticleCount) {
        updates.hasNew = true
      }
      updateCreator(creator.id, updates)
    } catch {
      // API失敗時はスキップ
    }
  }
  render()
}

// --- Service Worker ---

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
}

// --- Init ---

checkAndResetIfNeeded()
render()
refreshAllCreators()
