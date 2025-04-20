document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const fileList = document.getElementById('fileList');
    const fileContent = document.getElementById('fileContent');
    const uploadForm = document.getElementById('uploadForm');
    let currentUsername = null;
  
    // Get current username
    async function fetchCurrentUsername() {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': token }
      });
      const data = await res.json();
      return data.username;
    }
  
    if (!token && fileList) {
      alert('Please log in first');
      window.location.href = 'login.html';
      return;
    }
  
    if (token && fileList) {
      currentUsername = await fetchCurrentUsername();
    }
  
    // Upload file
    if (uploadForm) {
      uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(uploadForm);
  
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': token },
          body: formData
        });
  
        const data = await res.json();
        if (res.ok) {
          alert('Upload successful');
          window.location.reload();
        } else {
          alert(data.message || 'Upload failed');
        }
      });
    }
  
    // Load file list (public to all users)
    if (fileList) {
      const res = await fetch('/api/files', {
        headers: { 'Authorization': token }
      });
      const files = await res.json();
  
      fileList.innerHTML = '';
      files.forEach(file => {
        const isOwner = file.owner === currentUsername;
        const li = document.createElement('li');
      
        li.innerHTML = `
          <strong>${file.filename}</strong> <em>(owner: ${file.owner})</em>
          ${isOwner
            ? `
              <button onclick="readFile('${file.id}', true)">👁 View</button>
              <button onclick="secureDownload('${file.id}', '${file.filename}')">⬇ Download</button>
              <button onclick="deleteFile('${file.id}')">🗑 Delete</button>
              <button onclick="shareFile('${file.id}')">🔗 Share</button>
              <span id="share-${file.id}"></span>
            `
            : ''
          }
        `;
      
        fileList.appendChild(li);
      });
      
    }
  
    // Read file content (either via share link or owner view)
    if (fileContent) {
      const urlParams = new URLSearchParams(window.location.search);
      const shareId = urlParams.get('share');
      const fileId = urlParams.get('file');
      const downloadArea = document.getElementById('downloadArea');
  
      if (shareId) {
        fetch(`/api/share/${shareId}`)
          .then(res => {
            if (!res.ok) throw new Error('Invalid or expired share link');
            return res.text();
          })
          .then(content => {
            fileContent.innerText = content;
  
            // Add download button
            const btn = document.createElement('button');
            btn.innerText = '⬇ Download File';
            btn.onclick = () => downloadSharedFile(shareId);
            if (downloadArea) downloadArea.appendChild(btn);
          })
          .catch(err => {
            fileContent.innerText = err.message;
          });
  
      } else if (fileId) {
        const token = localStorage.getItem('token');
        fetch(`/api/read/${fileId}`, {
          headers: { 'Authorization': token }
        })
          .then(res => res.text())
          .then(content => {
            fileContent.innerText = content;
          })
          .catch(() => {
            fileContent.innerText = 'Unable to read the file.';
          });
      }
    }
  });
  
  // Logout function
  function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
  
  // Delete file
  async function deleteFile(fileId) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/delete/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });
  
    const data = await res.json();
    if (res.ok) {
      alert('File deleted');
      location.reload();
    } else {
      alert(data.message || 'Delete failed');
    }
  }
  
  // Read file (owner vs shared)
  function readFile(fileId, isOwner) {
    const token = localStorage.getItem('token');
    const url = isOwner
      ? `/file.html?file=${fileId}&token=${token}`
      : `/file.html?share=${fileId}`;
    window.open(url, '_blank');
  }
  
  // Share file
  async function shareFile(fileId) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/share/${fileId}`, {
      method: 'POST',
      headers: { 'Authorization': token }
    });
  
    const data = await res.json();
    if (res.ok) {
      const shareUrl = `${window.location.origin}/file.html?share=${data.shareId}`;
      document.getElementById(`share-${fileId}`).innerHTML =
        `<a href="${shareUrl}" target="_blank">${shareUrl}</a>`;
    } else {
      alert(data.message || 'Share failed');
    }
  }
  
  // Secure download (for owner)
  async function secureDownload(fileId, fileName) {
    const token = localStorage.getItem('token');
  
    try {
      const res = await fetch(`/api/download/${fileId}`, {
        headers: {
          'Authorization': token
        }
      });
  
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Download failed');
        return;
      }
  
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
  
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(fileName);
      document.body.appendChild(a);
      a.click();
      a.remove();
  
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to download file.');
      console.error(e);
    }
  }
  
  // Download shared file
  async function downloadSharedFile(shareId) {
    try {
      const res = await fetch(`/api/share-download/${shareId}`);
  
      if (!res.ok) {
        const text = await res.text();
        alert(text || 'Download failed');
        return;
      }
  
      const disposition = res.headers.get("Content-Disposition");
      let filename = "shared_file.txt";
  
      if (disposition && disposition.includes("filename=")) {
        filename = disposition.split("filename=")[1].replace(/"/g, "");
      }
  
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
  
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
  
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed');
      console.error(e);
    }
  }
  