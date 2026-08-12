document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('signup');
const msg = document.getElementById('signup-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const button = form.querySelector('button');

  msg.classList.remove('is-err');
  msg.textContent = '';
  button.disabled = true;

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (data.ok) {
      form.reset();
      msg.textContent = "You're on the list. See you at launch.";
    } else {
      msg.classList.add('is-err');
      msg.textContent = 'That email looks off — try again?';
    }
  } catch {
    msg.classList.add('is-err');
    msg.textContent = "Couldn't reach the server. Try again in a moment.";
  } finally {
    button.disabled = false;
  }
});
