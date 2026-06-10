const hamburger = document.querySelector(".hamburger-menu");
const sidebar = document.getElementById("sidebar");
const layout = document.getElementById("layout");

// Toggle Sidebar & Shift Layout Content
if (hamburger && sidebar && layout) {
  hamburger.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("active");
    hamburger.classList.toggle("active");
    layout.classList.toggle("shifted");
    
    // Refresh history sidebar view list whenever it is opened
    if (sidebar.classList.contains("active")) {
      loadHistory();
    }
  });
}

// Close sidebar and reset layout when clicking anywhere outside
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

/* ================= BACKEND CONNECTION ================= */

const form = document.getElementById("upload-form");  
const result = document.getElementById("result");
const summarizeBtn = document.getElementById("summarizeBtn");

let uploadedDocId = null;  // Stores the currently active doc ID

// 1. FETCH AND RENDER PREVIOUS DOCUMENTS WITH DELETE ICONS
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

    // Map documents to rows containing both the file link and a dustbin icon
    historyList.innerHTML = docs.map(doc => `
      <div class="history-item-wrapper">
        <a href="#" class="history-item" data-id="${doc.id}">
          📄 ${doc.filename}
        </a>
        <button class="delete-btn" data-id="${doc.id}" title="Delete entry">🗑️</button>
      </div>
    `).join("");

    // Add click listeners to every history file selection link
    document.querySelectorAll(".history-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const docId = item.getAttribute("data-id");
        // Pull text content carefully ignoring wrapper spaces
        const filename = item.textContent.replace('📄', '').trim();
        loadPreviousDoc(docId, filename);
      });
    });

    // Add click listeners to every dustbin icon
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevents clicking the dustbin from choosing/loading the file
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

// 2. SELECT A PREVIOUS DOCUMENT FROM SIDEBAR (AUTOMATICALLY FETCHES SUMMARY)
async function loadPreviousDoc(id, filename) {
  uploadedDocId = id; // Update global tracking variable
  
  result.innerText = `Loading cached summary for: ${filename}...`;
  
  // Close sidebar items cleanly on click
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
  if (layout) layout.classList.remove("shifted");

  try {
    const res = await fetch(`/summarize/${id}`);  

    if (!res.ok) {
        throw new Error(`Server Error: ${res.status} ${res.statusText}`);
    }

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

// 3. HIT THE BACKEND DELETE API ENDPOINT
async function deleteHistoryEntry(id) {
  try {
    const res = await fetch(`/history/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error("Failed to delete document from backend storage");
    }

    // Reset layout view box if the active loaded document was the one deleted
    if (uploadedDocId === id) {
      uploadedDocId = null;
      document.getElementById("result").innerText = "The active document was deleted.";
    }

    // Refresh history panel entries listing
    loadHistory();

  } catch (error) {
    console.error(error);
    alert("Error deleting file: " + error.message);
  }
}

// 4. FILE UPLOAD EVENT LISTENER
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

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (data.id) {
            uploadedDocId = data.id;  
            result.innerText = data.message || "Upload successful.";
            loadHistory(); // Refresh history list instantly on upload!
        } else {
            result.innerText = data.error || "Upload failed.";
        }
    } catch (error) {
        console.error(error);
        result.innerText = "Upload failed. Check console.";
    }
  });
}

// 5. SUMMARIZE EVENT LISTENER
if (summarizeBtn) {
  summarizeBtn.addEventListener("click", async () => {
    if (!uploadedDocId) {
        result.innerText = "Please upload or select a PDF first.";
        return;
    }

    result.innerText = "Generating summary...";

    try {
        const res = await fetch(`/summarize/${uploadedDocId}`);  

        if (!res.ok) {
            throw new Error(`Server Error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        result.innerText = data.summary || data.error;
        
    } catch (error) {
        console.error(error);
        result.innerText = "Error: " + error.message + " (Check Python Terminal)";
    }
  });
}

// Pre-hydrate document storage item listings right on window start up
document.addEventListener("DOMContentLoaded", loadHistory);