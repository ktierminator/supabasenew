/**
 * SUPABASE CONFIGURATION
 * Get these from your Supabase Project Settings -> API
 */
const SUPABASE_URL = "https://qjoyjmjtkcblwfpggzwq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqb3lqbWp0a2NibHdmcGdnendxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMzM0MTMsImV4cCI6MjA4OTgwOTQxM30.C_5BGwZzvs5gLBdz7H-vvDhsHUV83oy2ypSG3jBK6oI";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let currentRoom = null;
let currentUser = null;
let messageSubscription = null;

// DOM Selectors
const landingView = document.getElementById('landing-view');
const chatView = document.getElementById('chat-view');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');

function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const savedUser = localStorage.getItem('chat_username');

  if (savedUser) {
    document.getElementById('join-username').value = savedUser;
    document.getElementById('create-username').value = savedUser;
  }
  if (roomParam) {
    document.getElementById('join-code').value = roomParam.toUpperCase();
    switchTab('join');
  }

  document.getElementById('tab-join').onclick = () => switchTab('join');
  document.getElementById('tab-create').onclick = () => switchTab('create');
  document.getElementById('form-join').onsubmit = handleJoin;
  document.getElementById('form-create').onsubmit = handleCreate;
  document.getElementById('form-message').onsubmit = sendMessage;
  document.getElementById('btn-leave').onclick = () => window.location.reload();
  document.getElementById('btn-copy-link').onclick = copyLink;
  fileInput.onchange = handleFileSelect;
  document.getElementById('btn-clear-file').onclick = clearFile;
}

function switchTab(type) {
  const isJoin = type === 'join';
  document.getElementById('tab-join').classList.toggle('active', isJoin);
  document.getElementById('tab-create').classList.toggle('active', !isJoin);
  document.getElementById('form-join').classList.toggle('hidden', !isJoin);
  document.getElementById('form-create').classList.toggle('hidden', isJoin);
}

async function handleCreate(e) {
  e.preventDefault();
  const user = document.getElementById('create-username').value.trim();
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  // In Supabase, we "upsert" the room
  const { error } = await supabase.from('rooms').insert([{ code: roomCode, creator: user }]);
  if (error) return alert("Error creating room");
  
  startChat(user, roomCode);
}

async function handleJoin(e) {
  e.preventDefault();
  const user = document.getElementById('join-username').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();

  const { data, error } = await supabase.from('rooms').select('*').eq('code', code).single();
  if (error || !data) return alert("Room not found!");

  startChat(user, code);
}

function startChat(user, code) {
  currentUser = user;
  currentRoom = code;
  localStorage.setItem('chat_username', user);
  
  document.getElementById('room-code-display').innerText = `Room: ${code}`;
  document.getElementById('current-user-display').innerText = `You: ${user}`;
  
  landingView.classList.add('hidden');
  chatView.classList.remove('hidden');

  loadHistory();
  subscribeToMessages();
}

async function loadHistory() {
  const { data } = await supabase.from('messages')
    .select('*')
    .eq('room_code', currentRoom)
    .order('created_at', { ascending: true });
  
  if (data) data.forEach(renderMessage);
}

function subscribeToMessages() {
  messageSubscription = supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_code=eq.${currentRoom}` }, 
    payload => {
      renderMessage(payload.new);
    })
    .subscribe();
}

async function sendMessage(e) {
  e.preventDefault();
  const text = messageInput.value.trim();
  const file = fileInput.files[0];
  if (!text && !file) return;

  document.getElementById('btn-send').disabled = true;
  let mediaUrl = null;

  if (file) {
    document.getElementById('upload-indicator').classList.remove('hidden');
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('chat-media').upload(`${currentRoom}/${fileName}`, file);
    if (data) {
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(`${currentRoom}/${fileName}`);
      mediaUrl = urlData.publicUrl;
    }
  }

  await supabase.from('messages').insert([{
    room_code: currentRoom,
    username: currentUser,
    content: text,
    media_url: mediaUrl,
    media_type: file ? (file.type.startsWith('video') ? 'video' : 'image') : null
  }]);

  messageInput.value = '';
  clearFile();
  document.getElementById('btn-send').disabled = false;
  document.getElementById('upload-indicator').classList.add('hidden');
}

function renderMessage(msg) {
  const isMe = msg.username === currentUser;
  const div = document.createElement('div');
  div.className = `message-wrapper ${isMe ? 'me' : 'other'}`;
  
  div.innerHTML = `
    <div class="message-sender">${msg.username}</div>
    <div class="message-bubble">
      ${msg.media_url ? (msg.media_type === 'video' ? `<video src="${msg.media_url}" controls></video>` : `<img src="${msg.media_url}" />`) : ''}
      <p>${msg.content || ''}</p>
      <span class="message-time">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    </div>
  `;
  messagesList.appendChild(div);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function handleFileSelect() {
  const file = fileInput.files[0];
  if (file) {
    document.getElementById('file-preview-name').classList.remove('hidden');
    document.getElementById('file-preview-name').querySelector('span').innerText = file.name;
  }
}

function clearFile() {
  fileInput.value = '';
  document.getElementById('file-preview-name').classList.add('hidden');
}

function copyLink() {
  const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
  navigator.clipboard.writeText(link);
  alert("Invite link copied!");
}

init();
