function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function showView(id) {
    document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

async function refresh() {
    const { session } = await sendMessage({ type: 'GET_SESSION' });
    if (session) {
        document.getElementById('user-name').textContent = session.name;
        showView('view-session');
    } else {
        showView('view-login');
    }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    const result = await sendMessage({ type: 'LOGIN', email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';

    if (result.error) {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
        return;
    }
    await refresh();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' });
    await refresh();
});

refresh();
