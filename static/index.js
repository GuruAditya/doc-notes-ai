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

const form = document.getElementById("upload-form");  
const result = document.getElementById("result");
const summarizeBtn = document.getElementById("summarizeBtn");

let uploadedDocId = null;  

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
        
        if (confirm("Are you sure you want to permanently delete this document and summary from your database?")) {
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
  
  // Show comments section immediately
  document.getElementById("comments-section").style.display = "block";
  loadComments(id);
  
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

    if (uploadedDocId === id) {
      uploadedDocId = null;
      document.getElementById("result").innerText = "The active document was deleted.";
      document.getElementById("comments-section").style.display = "none";
    }
    loadHistory();
  } catch (error) {
    console.error(error);
    alert("Error deleting file: " + error.message);
  }
}

async function loadComments(docId) {
  const commentsList = document.getElementById("comments-list");
  if (!commentsList) return;

  try {
    const res = await fetch(`/documents/${docId}/comments`);
    if (!res.ok) throw new Error("Failed to load comments");

    const comments = await res.json();
    
    if (comments.length === 0) {
      commentsList.innerHTML = '<p style="color: #666; font-style: italic; margin: 0;">No notes or comments added yet.</p>';
      return;
    }

    commentsList.innerHTML = comments.map(c => {
      const date = new Date(c.created_at).toLocaleDateString(undefined, {hour: '2-digit', minute:'2-digit'});
      return `
        <div class="comment-card">
          <p style="margin: 0 0 6px 0; color: #e0e0e6; font-size: 14px; word-break: break-word; line-height: 1.4;">${c.text}</p>
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
    document.getElementById("comments-section").style.display = "none"; 

    try {
        const res = await fetch("/upload", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.id) {
            uploadedDocId = data.id;  
            result.innerText = data.message || "Upload successful.";
            loadHistory(); 
            
            // Show comments immediately for the newly uploaded file
            document.getElementById("comments-section").style.display = "flex";
            loadComments(uploadedDocId);
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

document.addEventListener("DOMContentLoaded", loadHistory);