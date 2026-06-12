/* ================= FIREBASE INITIALIZATION ================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

    const firebaseConfig = {
  apiKey: "AIzaSyBWlY0X2xl_39rrvb9A6cqhmReZqmdP_Lg",
  authDomain: "ai-docs-c8f3e.firebaseapp.com",
  projectId: "ai-docs-c8f3e",
  storageBucket: "ai-docs-c8f3e.firebasestorage.app",
  messagingSenderId: "1083653606714",
  appId: "1:1083653606714:web:83d7c2193297f02824d403",
  measurementId: "G-H8LPVKS8J6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUserToken = null;

// Handle Auth State Changes (Google, Guest, or Logged Out)
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserToken = await user.getIdToken();
    
    // UI Updates - Hide login buttons, show app
    document.getElementById("login-group").style.display = "none";
    document.getElementById("user-info").style.display = "flex";
    
    // Distinguish between Guest and Google User
    if (user.isAnonymous) {
      document.getElementById("user-email").innerText = "Guest User";
    } else {
      document.getElementById("user-email").innerText = user.email;
    }
    
    document.getElementById("login-prompt").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    
    // Load secure data for this specific user
    loadHistory();
  } else {
    currentUserToken = null;
    
    // UI Updates - Show login buttons, hide app
    document.getElementById("login-group").style.display = "block";
    document.getElementById("user-info").style.display = "none";
    document.getElementById("login-prompt").style.display = "block";
    document.getElementById("app-container").style.display = "none";
  }
});

// Auth Button Click Handlers
document.getElementById("login-btn").onclick = () => signInWithPopup(auth, provider);
document.getElementById("logout-btn").onclick = () => signOut(auth);
document.getElementById("guest-btn").onclick = async () => {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    showToast("Failed to sign in as guest.", true);
    console.error("Guest Auth Error:", error);
  }
};

// Helper function to inject security token into every request
function getAuthHeaders(contentType = null) {
  const headers = { "Authorization": `Bearer ${currentUserToken}` };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

/* ================= UI NOTIFICATIONS & MODALS ================= */
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px'; toast.style.right = '20px';
  toast.style.backgroundColor = isError ? '#ff5c5c' : '#7289da';
  toast.style.color = '#fff'; toast.style.padding = '12px 20px';
  toast.style.borderRadius = '6px'; toast.style.zIndex = '10000';
  toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
  toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showDeleteModal(onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0'; overlay.style.left = '0';
  overlay.style.width = '100%'; overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
  overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  const box = document.createElement('div');
  box.style.backgroundColor = '#2a2a35'; box.style.padding = '25px'; box.style.borderRadius = '10px';
  box.style.textAlign = 'center'; box.style.color = '#e0e0e6';
  box.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 10px; color: #fff;">Delete Note?</h3>
    <p style="margin-top: 0; margin-bottom: 25px; font-size: 14px; color: #a0a0b0;">This action cannot be undone.</p>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button id="modal-cancel" style="background: #3e3f46; padding: 10px 20px; flex: 1; border:none; border-radius: 4px; color: white; cursor: pointer;">Cancel</button>
      <button id="modal-confirm" style="background: #ff5c5c; padding: 10px 20px; flex: 1; border:none; border-radius: 4px; color: white; cursor: pointer;">Delete</button>
    </div>
  `;
  overlay.appendChild(box); document.body.appendChild(overlay);
  document.getElementById('modal-cancel').onclick = () => overlay.remove();
  document.getElementById('modal-confirm').onclick = () => { overlay.remove(); onConfirm(); };
}

/* ================= UI & SIDEBAR ================= */
const hamburger = document.querySelector(".hamburger-menu");
const sidebar = document.getElementById("sidebar");
const layout = document.getElementById("layout");

if (hamburger && sidebar && layout) {
  hamburger.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("active"); hamburger.classList.toggle("active"); layout.classList.toggle("shifted");
    if (sidebar.classList.contains("active") && currentUserToken) loadHistory();
  });
}
document.addEventListener("click", () => {
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
  if (layout) layout.classList.remove("shifted");
});
if (sidebar) sidebar.addEventListener("click", (event) => event.stopPropagation());


/* ================= CORE STATE & ELEMENTS ================= */
const form = document.getElementById("upload-form");  
const result = document.getElementById("result");
const summarizeBtn = document.getElementById("summarizeBtn");
let uploadedDocId = null;  

/* ================= DOCUMENT HISTORY ================= */
async function loadHistory() {
  if (!currentUserToken) return;
  const historyList = document.getElementById("history-list");
  if (!historyList) return;

  try {
    const res = await fetch("/history", { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Could not fetch history");
    
    const docs = await res.json(); 
    if (docs.length === 0) {
      historyList.innerHTML = '<span class="no-history" style="color: #666; padding: 15px; display: block;">No history yet</span>';
      return;
    }

    historyList.innerHTML = docs.map(doc => `
      <div class="history-item-wrapper">
        <a href="#" class="history-item" data-id="${doc.id}">📄 ${doc.filename}</a>
        <button class="delete-btn" data-id="${doc.id}" title="Delete entry" style="background: none; border: none; cursor: pointer;">🗑️</button>
      </div>
    `).join("");

    document.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const docId = item.getAttribute("data-id");
        loadPreviousDoc(docId, item.textContent.replace('📄', '').trim());
      });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); 
        const docId = btn.getAttribute("data-id");
        showDeleteModal(async () => await deleteHistoryEntry(docId));
      });
    });

  } catch (err) { console.error("Error loading history:", err); }
}

async function loadPreviousDoc(id, filename) {
  uploadedDocId = id; 
  result.innerText = `Loading cached summary for: ${filename}...`;
  document.getElementById("comments-section").style.display = "flex"; 
  document.getElementById("chat-section").style.display = "flex";    
  loadComments(id);
  
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
  if (layout) layout.classList.remove("shifted");

  try {
    const res = await fetch(`/summarize/${id}`, { headers: getAuthHeaders() });  
    if (!res.ok) throw new Error(`Server Error: ${res.status}`);

    const data = await res.json();
    result.innerText = data.summary ? `📄 Document: ${filename}\n\n${data.summary}` : `Selected: ${filename}\n\nThis document hasn't been summarized yet. Click the "Summarize Document" button below to generate one.`;
  } catch (error) { result.innerText = `Error loading document "${filename}": ` + error.message; }
}

async function deleteHistoryEntry(id) {
  try {
    const res = await fetch(`/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to delete document from backend storage");

    if (uploadedDocId === id) {
      uploadedDocId = null;
      document.getElementById("result").innerText = "The active document was deleted.";
      document.getElementById("comments-section").style.display = "none";
      document.getElementById("chat-section").style.display = "none";
    }
    loadHistory();
    showToast("Document successfully deleted");
  } catch (error) { showToast("Error deleting file.", true); }
}

/* ================= NOTEBOOK COMMENTS ================= */
async function loadComments(docId) {
  const commentsList = document.getElementById("comments-list");
  if (!commentsList) return;

  try {
    const res = await fetch(`/documents/${docId}/comments?t=${Date.now()}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Failed to load comments");
    const comments = await res.json();
    
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p style="color: #666; font-style: italic; margin: 0;">No notes or comments added yet.</p>';
      return;
    }

    commentsList.innerHTML = comments.map(c => {
      const date = new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="comment-card" id="comment-card-${c.id}" style="background: #2a2a35; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
          <div class="comment-header" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
             <span style="font-size: 11px; color: #666; font-weight: 500;">${date}</span>
             <div class="comment-actions">
               <button class="comment-action-btn edit-note-btn" data-id="${c.id}" title="Edit note" style="background: none; border: none; cursor: pointer;">✏️</button>
               <button class="comment-action-btn delete-note-btn" data-id="${c.id}" title="Delete note" style="background: none; border: none; cursor: pointer;">🗑️</button>
             </div>
          </div>
          <p id="comment-text-${c.id}" style="margin: 0; color: #e0e0e6; font-size: 14px;">${c.text}</p>
        </div>
      `;
    }).join("");
  } catch (error) { console.error("Error drawing comments layer:", error); }
}

const commentForm = document.getElementById("comment-form");
if (commentForm) {
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!uploadedDocId) return; 

    const input = document.getElementById("comment-input");
    const commentText = input.value.trim();
    if (!commentText) return;

    try {
      const res = await fetch(`/documents/${uploadedDocId}/comments`, {
        method: "POST",
        headers: getAuthHeaders("application/json"),
        body: JSON.stringify({ text: commentText })
      });
      if (!res.ok) throw new Error("Could not save comment");
      input.value = ""; 
      loadComments(uploadedDocId); 
    } catch (error) { showToast("Error saving comment.", true); }
  });
}

// Inline Editing/Deleting
const commentsList = document.getElementById("comments-list");
if (commentsList) {
  commentsList.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".delete-note-btn");
    if (deleteBtn) {
      const cId = deleteBtn.getAttribute("data-id");
      if (!cId || cId === "undefined") return showToast("Old comments without IDs cannot be modified.", true);
      showDeleteModal(async () => {
        try {
          await fetch(`/documents/${uploadedDocId}/comments/${cId}`, { method: 'DELETE', headers: getAuthHeaders() });
          loadComments(uploadedDocId); showToast("Note deleted.");
        } catch (err) { showToast("Failed to delete note.", true); }
      });
    }

    const editBtn = e.target.closest(".edit-note-btn");
    if (editBtn) {
      const cId = editBtn.getAttribute("data-id");
      if (!cId || cId === "undefined") return showToast("Old comments without IDs cannot be modified.", true);
      
      const pTag = document.getElementById(`comment-text-${cId}`);
      const actionBtns = pTag.parentNode.querySelector(".comment-actions");
      const currentText = pTag.innerText;

      const editContainer = document.createElement("div"); editContainer.style.marginTop = "8px";
      const textarea = document.createElement("textarea"); textarea.value = currentText; textarea.style.width = "100%"; textarea.style.minHeight = "60px"; textarea.style.padding = "8px"; textarea.style.borderRadius = "4px"; textarea.style.border = "1px solid #7289da"; textarea.style.background = "#1e1e24"; textarea.style.color = "#fff"; textarea.style.fontFamily = "inherit"; textarea.style.fontSize = "13px"; textarea.style.boxSizing = "border-box"; textarea.style.resize = "vertical";
      const btnGroup = document.createElement("div"); btnGroup.style.display = "flex"; btnGroup.style.gap = "8px"; btnGroup.style.justifyContent = "flex-end"; btnGroup.style.marginTop = "8px";
      const cancelBtn = document.createElement("button"); cancelBtn.innerText = "Cancel"; cancelBtn.style.padding = "6px 12px"; cancelBtn.style.background = "#3e3f46"; cancelBtn.style.fontSize = "12px"; cancelBtn.style.flex = "none"; cancelBtn.style.border = "none"; cancelBtn.style.borderRadius = "4px"; cancelBtn.style.color = "white"; cancelBtn.style.cursor = "pointer";
      const saveBtn = document.createElement("button"); saveBtn.innerText = "Save"; saveBtn.style.padding = "6px 12px"; saveBtn.style.background = "#248046"; saveBtn.style.fontSize = "12px"; saveBtn.style.flex = "none"; saveBtn.style.border = "none"; saveBtn.style.borderRadius = "4px"; saveBtn.style.color = "white"; saveBtn.style.cursor = "pointer";

      btnGroup.appendChild(cancelBtn); btnGroup.appendChild(saveBtn);
      editContainer.appendChild(textarea); editContainer.appendChild(btnGroup);

      pTag.style.display = "none"; if (actionBtns) actionBtns.style.display = "none";
      pTag.parentNode.insertBefore(editContainer, pTag.nextSibling);

      cancelBtn.onclick = () => { editContainer.remove(); pTag.style.display = "block"; if (actionBtns) actionBtns.style.display = "flex"; };
      saveBtn.onclick = async () => {
        const newText = textarea.value.trim();
        if (newText && newText !== currentText) {
          saveBtn.innerText = "Saving...";
          try {
            await fetch(`/documents/${uploadedDocId}/comments/${cId}`, {
              method: "PUT", headers: getAuthHeaders("application/json"), body: JSON.stringify({ text: newText })
            });
            loadComments(uploadedDocId); showToast("Note updated.");
          } catch (err) { showToast("Failed to update note.", true); saveBtn.innerText = "Save"; }
        } else { cancelBtn.click(); }
      };
    }
  });
}

/* ================= UPLOAD & SUMMARIZE ================= */
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUserToken) return showToast("Please log in first", true);

    const fileInput = document.getElementById("ads");
    if (!fileInput.files.length) return result.innerText = "Please select a file first.";

    const formData = new FormData(); formData.append("file", fileInput.files[0]);  
    result.innerText = "Uploading PDF..."; uploadedDocId = null;
    document.getElementById("comments-section").style.display = "none"; document.getElementById("chat-section").style.display = "none"; 

    try {
        const res = await fetch("/upload", { method: "POST", headers: { "Authorization": `Bearer ${currentUserToken}` }, body: formData });
        const data = await res.json();
        
        if (data.id) {
            uploadedDocId = data.id; result.innerText = data.message || "Upload successful.";
            loadHistory(); 
            document.getElementById("comments-section").style.display = "flex"; document.getElementById("chat-section").style.display = "flex";
            loadComments(uploadedDocId); document.getElementById("chat-log").innerHTML = ""; showToast("Document uploaded successfully");
        } else { result.innerText = data.error || "Upload failed."; }
    } catch (error) { result.innerText = "Upload failed. Check console."; }
  });
}

if (summarizeBtn) {
  summarizeBtn.addEventListener("click", async () => {
    if (!uploadedDocId) return result.innerText = "Please upload or select a PDF first.";
    result.innerText = "Generating summary...";
    try {
        const res = await fetch(`/summarize/${uploadedDocId}`, { headers: getAuthHeaders() });  
        if (!res.ok) throw new Error(`Server Error: ${res.status}`);
        const data = await res.json(); result.innerText = data.summary || data.error;
    } catch (error) { result.innerText = "Error: " + error.message; }
  });
}

/* ================= AI CHAT LOGIC ================= */
const chatForm = document.getElementById("chat-form");
const chatLog = document.getElementById("chat-log");
const clearChatBtn = document.getElementById("clear-chat-btn");

function appendChatMessage(sender, message) {
  const bubble = document.createElement("div"); const isUser = sender === "You";
  bubble.style.padding = "10px 14px"; bubble.style.borderRadius = "8px"; bubble.style.fontSize = "14px"; bubble.style.lineHeight = "1.5"; bubble.style.maxWidth = "85%"; bubble.style.wordBreak = "break-word"; bubble.style.whiteSpace = "pre-wrap";
  
  if (isUser) { bubble.style.alignSelf = "flex-end"; bubble.style.background = "#4e5d94"; bubble.style.color = "#fff"; } 
  else { bubble.style.alignSelf = "flex-start"; bubble.style.background = "#2a2a35"; bubble.style.color = "#e0e0e6"; bubble.style.borderLeft = "3px solid #7289da"; }
  
  bubble.innerHTML = `<strong>${sender}:</strong> <br/> ${message}`;
  chatLog.appendChild(bubble); chatLog.scrollTop = chatLog.scrollHeight; 
}

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault(); if (!uploadedDocId) return;
    const input = document.getElementById("chat-input"); const question = input.value.trim(); if (!question) return;

    appendChatMessage("You", question); input.value = "";
    
    const loadingId = "loading-" + Date.now(); const loadingBubble = document.createElement("div");
    loadingBubble.id = loadingId; loadingBubble.style.alignSelf = "flex-start"; loadingBubble.style.color = "#8a8a9a"; loadingBubble.style.fontSize = "13px"; loadingBubble.innerText = "AI is thinking...";
    chatLog.appendChild(loadingBubble); chatLog.scrollTop = chatLog.scrollHeight;

    try {
      const res = await fetch(`/documents/${uploadedDocId}/ask`, {
        method: "POST", headers: getAuthHeaders("application/json"), body: JSON.stringify({ question: question })
      });
      if (!res.ok) throw new Error("Failed to get answer");
      const data = await res.json();
      document.getElementById(loadingId).remove(); appendChatMessage("AI", data.answer);
    } catch (error) {
      document.getElementById(loadingId).remove(); appendChatMessage("System Error", "Failed to connect to AI. Please try again.");
    }
  });
}

if (clearChatBtn) clearChatBtn.addEventListener("click", () => { chatLog.innerHTML = ""; });