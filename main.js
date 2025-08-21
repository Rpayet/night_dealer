function forCommit() {
    const p = document.createElement('p');
    p.textContent = 'right now';
    return p;
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(forCommit());
});