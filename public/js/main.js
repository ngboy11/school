// public/js/main.js
(async function(){
  const romanClasses = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  const classSelect = document.getElementById('classSelect');
  const filterClass = document.getElementById('filterClass');

  if (classSelect) {
    romanClasses.forEach(c => {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; classSelect.appendChild(opt);
    });
  }
  if (filterClass) {
    romanClasses.forEach(c => {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; filterClass.appendChild(opt);
    });
  }

  // Helpers
  async function api(path, opts={}) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: {'Content-Type':'application/json'} }, opts));
    return res.json();
  }

  // On index pages (login/register)
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const body = { email: fd.get('email'), password: fd.get('password') };
      const r = await api('/api/login', { method:'POST', body: JSON.stringify(body) });
      if (r.ok) window.location = '/dashboard.html';
      else document.getElementById('msg').textContent = r.error || 'Login failed';
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const body = { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('role') };
      const r = await api('/api/register', { method:'POST', body: JSON.stringify(body) });
      if (r.ok) window.location = '/dashboard.html';
      else document.getElementById('msg').textContent = r.error || 'Register failed';
    });
  }

  // Dashboard
  if (document.body.contains(document.querySelector('.topbar'))) {
    const me = await api('/api/me');
    const userInfo = document.getElementById('userInfo');
    if (!me.user) { window.location = '/'; return; }
    userInfo.innerHTML = `<span>${me.user.name} (${me.user.role})</span>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await api('/api/logout', { method:'POST' }); window.location = '/';
    });

    // Load students
    const studentsTableBody = document.querySelector('#studentsTable tbody');
    async function loadStudents() {
      const q = document.getElementById('search').value || '';
      const cls = document.getElementById('filterClass').value || '';
      const section = document.getElementById('filterSection').value || '';
      const url = `/api/students?q=${encodeURIComponent(q)}&class=${encodeURIComponent(cls)}&section=${encodeURIComponent(section)}`;
      const r = await api(url);
      studentsTableBody.innerHTML = '';
      r.students.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s.roll}</td><td>${s.name}</td><td>${s.class}</td><td>${s.section}</td>
                        <td>${s.attendance}</td><td>${s.notes || ''}</td>
                        <td>
                          <button class="edit" data-id="${s.id}">Edit</button>
                          ${me.user.role === 'admin' ? `<button class="delete" data-id="${s.id}">Delete</button>` : ''}
                        </td>`;
        studentsTableBody.appendChild(tr);
      });
      // wire delete
      document.querySelectorAll('button.delete').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Delete this student?')) return;
          const id = b.getAttribute('data-id');
          const res = await api('/api/students/' + id, { method:'DELETE' });
          if (res.ok) loadStudents(); else alert(res.error || 'Error');
        });
      });
      // Edit handler (simple prompt-based)
      document.querySelectorAll('button.edit').forEach(b => {
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-id');
          const name = prompt('New name');
          if (!name) return;
          const roll = prompt('Roll number');
          const cls = prompt('Class (I..X)');
          const section = prompt('Section (A..D)');
          const notes = prompt('Notes');
          const attendance = parseInt(prompt('Attendance (number)'),10) || 0;
          const res = await api('/api/students/' + id, { method:'PUT', body: JSON.stringify({ name, roll, class: cls, section, notes, attendance })});
          if (res.ok) loadStudents(); else alert(res.error || 'Error');
        });
      });
    }

    // Add student
    document.getElementById('addStudentForm').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get('name'),
        roll: fd.get('roll'),
        class: fd.get('class'),
        section: fd.get('section'),
        notes: fd.get('notes')
      };
      const r = await api('/api/students', { method:'POST', body: JSON.stringify(body) });
      if (r.ok) { document.getElementById('addMsg').textContent = 'Student added'; e.target.reset(); loadStudents(); }
      else document.getElementById('addMsg').textContent = r.error || 'Error';
    });

    document.getElementById('filterBtn').addEventListener('click', loadStudents);
    document.getElementById('search').addEventListener('keyup', () => { /* optional live search */ });

    loadStudents();
  }

})();
