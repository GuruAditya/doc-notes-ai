const hamburger = document.querySelector(".hamburger-menu");
const sidebar = document.getElementById("sidebar");

// Toggle Sidebar
if (hamburger) {
  hamburger.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("active");
    hamburger.classList.toggle("active");
  });
}

document.addEventListener("click", () => {
  if (sidebar) sidebar.classList.remove("active");
  if (hamburger) hamburger.classList.remove("active");
});

if (sidebar) {
  sidebar.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

/* ================= BACKEND CONNECTION ================= */

const form = document.getElementById("input");
const result = document.getElementById("result");
const summarizeBtn = document.getElementById("summarizeBtn");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById("ads");
    if (!fileInput.files.length) {
        result.innerText = "Please select a file first.";
        return;
    }

    const formData = new FormData();
    formData.append("ads", fileInput.files[0]);

    result.innerText = "Uploading PDF...";

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        result.innerText = data.message || data.error;
    } catch (error) {
        console.error(error);
        result.innerText = "Upload failed. Check console.";
    }
  });
}

if (summarizeBtn) {
  summarizeBtn.addEventListener("click", async () => {
    result.innerText = "Generating summary...";

    try {
        const res = await fetch("/summarize");
        
        // If server returns 500/404 HTML error page, this catches it
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