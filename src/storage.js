const KEYS = {
  creators: 'ohayomi_creators',
  dailyStatus: 'ohayomi_dailyStatus',
  lastResetAt: 'ohayomi_lastResetAt',
  streak: 'ohayomi_streak',
  pendingCreatorId: 'ohayomi_pendingCreatorId',
}

// --- Creators ---

export function getCreators() {
  return JSON.parse(localStorage.getItem(KEYS.creators) || '[]')
}

export function getActiveCreators() {
  return getCreators()
    .filter((c) => !c.archived)
    .sort((a, b) => a.order - b.order)
}

export function getArchivedCreators() {
  return getCreators().filter((c) => c.archived)
}

function saveCreators(creators) {
  localStorage.setItem(KEYS.creators, JSON.stringify(creators))
}

export function addCreator(username, name) {
  const creators = getCreators()
  const exists = creators.find((c) => c.username === username)
  if (exists) return null

  const maxOrder = creators.reduce((max, c) => Math.max(max, c.order), 0)
  const creator = {
    id: 'c' + Date.now(),
    username,
    name: name || username,
    url: `https://note.com/${username}`,
    iconUrl: null,
    order: maxOrder + 1,
    archived: false,
    lastKnownArticleCount: null,
    lastCheckedAt: null,
  }
  creators.push(creator)
  saveCreators(creators)
  return creator
}

export function updateCreator(id, updates) {
  const creators = getCreators()
  const idx = creators.findIndex((c) => c.id === id)
  if (idx === -1) return null
  Object.assign(creators[idx], updates)
  saveCreators(creators)
  return creators[idx]
}

export function reorderCreators(orderedIds) {
  const creators = getCreators()
  orderedIds.forEach((id, i) => {
    const c = creators.find((c) => c.id === id)
    if (c) c.order = i + 1
  })
  saveCreators(creators)
}

// --- Daily Status ---

export function getDailyStatus() {
  return JSON.parse(localStorage.getItem(KEYS.dailyStatus) || '{}')
}

function saveDailyStatus(status) {
  localStorage.setItem(KEYS.dailyStatus, JSON.stringify(status))
}

export function getCreatorStatus(creatorId) {
  const daily = getDailyStatus()
  const item = daily.items?.[creatorId]
  return {
    read: item?.read || false,
    commented: item?.commented || false,
  }
}

export function setCreatorStatus(creatorId, { read, commented }) {
  const daily = getDailyStatus()
  if (!daily.items) daily.items = {}
  daily.items[creatorId] = {
    read,
    commented,
    updatedAt: (read || commented) ? new Date().toISOString() : null,
  }
  saveDailyStatus(daily)
}

// --- Daily Reset ---

export function getLastResetAt() {
  return localStorage.getItem(KEYS.lastResetAt)
}

function saveLastResetAt(isoString) {
  localStorage.setItem(KEYS.lastResetAt, isoString)
}

export function checkAndResetIfNeeded() {
  const now = new Date()
  const today5am = new Date(now)
  today5am.setHours(5, 0, 0, 0)

  if (now < today5am) {
    today5am.setDate(today5am.getDate() - 1)
  }

  const lastResetAt = getLastResetAt()
  if (!lastResetAt || new Date(lastResetAt) < today5am) {
    resetAllStatus()
    saveLastResetAt(now.toISOString())
    return true
  }
  return false
}

export function resetAllStatus() {
  const creators = getActiveCreators()
  const daily = {
    dateKey: new Date().toISOString().slice(0, 10),
    items: {},
  }
  creators.forEach((c) => {
    daily.items[c.id] = { read: false, commented: false, updatedAt: null }
  })
  saveDailyStatus(daily)
}

// --- Pending Creator (sessionStorage) ---

export function setPendingCreatorId(id) {
  sessionStorage.setItem(KEYS.pendingCreatorId, id)
}

export function getPendingCreatorId() {
  return sessionStorage.getItem(KEYS.pendingCreatorId)
}

export function clearPendingCreatorId() {
  sessionStorage.removeItem(KEYS.pendingCreatorId)
}

// --- Export / Import ---

export function exportData() {
  return JSON.stringify(getCreators(), null, 2)
}

export function importData(json) {
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('Invalid format')
  saveCreators(data)
}

// --- URL Parsing ---

export function parseNoteUrl(url) {
  const match = url.match(/note\.com\/([^\/\?#]+)/)
  if (match && match[1] !== 'api') {
    return match[1]
  }
  return null
}
