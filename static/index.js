/* ================= UI & SIDEBAR ================= */
const hamburger = document.querySelector(".hamburger-menu");
const sidebar = document.getElementById("sidebar");
const layout = document.getElementById("layout");

if (hamburger && sidebar && layout) {
  hamburger.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("active");
    hamburger.classList.toggle("active");
    layout.classList.toggle("shifted");
    
    if (sidebar.classList.contains("active")) {
      loadHistory();
    }
  });
}

document.addEventListener("click", () => {
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
  if (layout) layout.classList.remove("shifted");
});

if (sidebar) {
  sidebar.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

/* ================= CORE STATE & ELEMENTS ================= */
const form = document.getElementById("upload-form");  
const result = document.getElementById("result");
const summarizeBtn = document.getElementById("summarizeBtn");

let uploadedDocId = null;  

/* ================= DOCUMENT HISTORY ================= */
async function loadHistory() {
  const historyList = document.getElementById("history-list");
  if (!historyList) return;

  try {
    const res = await fetch("/history");
    if (!res.ok) throw new Error("Could not fetch history");
    
    const docs = await res.json(); 
    
    if (docs.length === 0) {
      historyList.innerHTML = '<span class="no-history" style="color: #666; padding: 15px; display: block;">No history yet</span>';
      return;
    }

    historyList.innerHTML = docs.map(doc => `
      <div class="history-item-wrapper">
        <a href="#" class="history-item" data-id="${doc.id}">
          📄 ${doc.filename}
        </a>
        <button class="delete-btn" data-id="${doc.id}" title="Delete entry">🗑️</button>
      </div>
    `).join("");

    document.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const docId = item.getAttribute("data-id");
        const filename = item.textContent.replace('📄', '').trim();
        loadPreviousDoc(docId, filename);
      });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); 
        const docId = btn.getAttribute("data-id");
        
        if (confirm("Are you sure you want to permanently delete this document and its data?")) {
          await deleteHistoryEntry(docId);
        }
      });
    });

  } catch (err) {
    console.error("Error loading history:", err);
  }
}

async function loadPreviousDoc(id, filename) {
  uploadedDocId = id; 
  result.innerText = `Loading cached summary for: ${filename}...`;
  
  // Show panels immediately
  document.getElementById("comments-section").style.display = "flex"; // Flex for notebook layout
  document.getElementById("chat-section").style.display = "block";    // Block for chat container
  
  // Load database comments
  loadComments(id);
  
  // Close sidebar
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
  if (layout) layout.classList.remove("shifted");

  try {
    const res = await fetch(`/summarize/${id}`);  
    if (!res.ok) throw new Error(`Server Error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    
    if (data.summary) {
        result.innerText = `📄 Document: ${filename}\n\n${data.summary}`;
    } else {
        result.innerText = `Selected: ${filename}\n\nThis document hasn't been summarized yet. Click the "Summarize Document" button below to generate one.`;
    }
  } catch (error) {
    console.error(error);
    result.innerText = `Error loading document "${filename}": ` + error.message;
  }
}

async function deleteHistoryEntry(id) {
  try {
    const res = await fetch(`/history/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error("Failed to delete document from backend storage");

    // If the user deleted the file they are currently looking at, clear the screen
    if (uploadedDocId === id) {
      uploadedDocId = null;
      document.getElementById("result").innerText = "The active document was deleted.";
      document.getElementById("comments-section").style.display = "none";
      document.getElementById("chat-section").style.display = "none";
    }
    loadHistory();
  } catch (error) {
    console.error(error);
    alert("Error deleting file: " + error.message);
  }
}

/* ================= NOTEBOOK COMMENTS ================= */
async function loadComments(docId) {
  const commentsList = document.getElementById("comments-list");
  if (!commentsList) return;

  try {
    // Cache buster included: ?t=${Date.now()}
    const res = await fetch(`/documents/${docId}/comments?t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to load comments");

    const comments = await res.json();
    
    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<p style="color: #666; font-style: italic; margin: 0;">No notes or comments added yet.</p>';
      return;
    }

    commentsList.innerHTML = comments.map(c => {
      // Corrected to toLocaleString for proper local time formatting
      const date = new Date(c.created_at).toLocaleString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      return `
        <div class="comment-card">
          <p>${c.text}</p>
          <span style="font-size: 11px; color: #666; font-weight: 500;">${date}</span>
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error("Error drawing comments layer:", error);
  }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText })
      });

      if (!res.ok) throw new Error("Could not save comment");
      input.value = ""; 
      loadComments(uploadedDocId); 
    } catch (error) {
      console.error(error);
      alert("Error saving comment: " + error.message);
    }
  });
}

/* ================= UPLOAD & SUMMARIZE ================= */
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById("ads");
    if (!fileInput.files.length) {
        result.innerText = "Please select a file first.";
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);  

    result.innerText = "Uploading PDF...";
    uploadedDocId = null;
    
    // Hide panels while uploading
    document.getElementById("comments-section").style.display = "none"; 
    document.getElementById("chat-section").style.display = "none"; 

    try {
        const res = await fetch("/upload", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.id) {
            uploadedDocId = data.id;  
            result.innerText = data.message || "Upload successful.";
            loadHistory(); 
            
            // Show panels for the newly uploaded file
            document.getElementById("comments-section").style.display = "flex";
            document.getElementById("chat-section").style.display = "block";
            loadComments(uploadedDocId);
            
            // Wipe old chat visually
            document.getElementById("chat-log").innerHTML = "";
        } else {
            result.innerText = data.error || "Upload failed.";
        }
    } catch (error) {
        console.error(error);
        result.innerText = "Upload failed. Check console.";
    }
  });
}

if (summarizeBtn) {
  summarizeBtn.addEventListener("click", async () => {
    if (!uploadedDocId) {
        result.innerText = "Please upload or select a PDF first.";
        return;
    }

    result.innerText = "Generating summary...";

    try {
        const res = await fetch(`/summarize/${uploadedDocId}`);  
        if (!res.ok) throw new Error(`Server Error: ${res.status} ${res.statusText}`);

        const data = await res.json();
        result.innerText = data.summary || data.error;
    } catch (error) {
        console.error(error);
        result.innerText = "Error: " + error.message + " (Check Python Terminal)";
    }
  });
}

/* ================= AI CHAT LOGIC ================= */
const chatForm = document.getElementById("chat-form");
const chatLog = document.getElementById("chat-log");
const clearChatBtn = document.getElementById("clear-chat-btn");

function appendChatMessage(sender, message) {
  const bubble = document.createElement("div");
  const isUser = sender === "You";
  
  bubble.style.padding = "10px 14px";
  bubble.style.borderRadius = "8px";
  bubble.style.fontSize = "14px";
  bubble.style.lineHeight = "1.5";
  bubble.style.maxWidth = "85%";
  bubble.style.wordBreak = "break-word";
  bubble.style.whiteSpace = "pre-wrap";
  
  if (isUser) {
    bubble.style.alignSelf = "flex-end";
    bubble.style.background = "#4e5d94"; 
    bubble.style.color = "#fff";
  } else {
    bubble.style.alignSelf = "flex-start";
    bubble.style.background = "#2a2a35"; 
    bubble.style.color = "#e0e0e6";
    bubble.style.borderLeft = "3px solid #7289da";
  }
  
  bubble.innerHTML = `<strong>${sender}:</strong> <br/> ${message}`;
  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight; 
}

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!uploadedDocId) return;

    const input = document.getElementById("chat-input");
    const question = input.value.trim();
    if (!question) return;

    appendChatMessage("You", question);
    input.value = "";
    
    const loadingId = "loading-" + Date.now();
    const loadingBubble = document.createElement("div");
    loadingBubble.id = loadingId;
    loadingBubble.style.alignSelf = "flex-start";
    loadingBubble.style.color = "#8a8a9a";
    loadingBubble.style.fontSize = "13px";
    loadingBubble.innerText = "AI is thinking...";
    chatLog.appendChild(loadingBubble);
    chatLog.scrollTop = chatLog.scrollHeight;

    try {
      const res = await fetch(`/documents/${uploadedDocId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question })
      });

      if (!res.ok) throw new Error("Failed to get answer");
      
      const data = await res.json();
      document.getElementById(loadingId).remove();
      appendChatMessage("AI", data.answer);

    } catch (error) {
      console.error(error);
      document.getElementById(loadingId).remove();
      appendChatMessage("System Error", "Failed to connect to AI. Please try again.");
    }
  });
}

// Clear Chat Button Logic
if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    chatLog.innerHTML = ""; 
  });
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", loadHistory);