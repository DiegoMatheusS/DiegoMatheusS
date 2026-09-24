const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const mapRange = (value, inMin, inMax, outMin = 0, outMax = 1) => {
    const progress = clamp((value - inMin) / (inMax - inMin));
    return outMin + (outMax - outMin) * progress;
};

// Aparição suave dos blocos conforme entram na tela.
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
    });
}, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });

revealElements.forEach((element) => revealObserver.observe(element));

// Cabeçalho ganha um pouco mais de presença depois do primeiro scroll.
const header = document.querySelector('.site-header');
const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 36);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

// Efeito principal da trajetória: as chaves aproximam, abrem e revelam o texto.
const braceTrack = document.querySelector('.brace-track');
const braceStage = document.querySelector('.brace-stage');
let braceTicking = false;

function updateBraceStory() {
    braceTicking = false;
    if (!braceTrack || !braceStage) return;

    const rect = braceTrack.getBoundingClientRect();
    const scrollable = Math.max(braceTrack.offsetHeight - window.innerHeight, 1);
    const progress = clamp(-rect.top / scrollable);

    const zoom = mapRange(progress, 0.02, 0.34);
    const open = mapRange(progress, 0.26, 0.66);
    const story = mapRange(progress, 0.53, 0.82);

    braceStage.style.setProperty('--brace-zoom', zoom.toFixed(4));
    braceStage.style.setProperty('--brace-open', open.toFixed(4));
    braceStage.style.setProperty('--story-progress', story.toFixed(4));
}

function requestBraceUpdate() {
    if (braceTicking) return;
    braceTicking = true;
    requestAnimationFrame(updateBraceStory);
}

updateBraceStory();
window.addEventListener('scroll', requestBraceUpdate, { passive: true });
window.addEventListener('resize', requestBraceUpdate);

// Luz suave que acompanha o mouse sem mudar o visual claro.
const cursorGlow = document.querySelector('.cursor-glow');
if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (event) => {
        cursorGlow.style.transform = `translate(${event.clientX - 208}px, ${event.clientY - 208}px)`;
    }, { passive: true });
}

// Microinteração nos cards. Deliberadamente sutil para manter aparência profissional.
const tiltCards = document.querySelectorAll('.tilt-card');
const canTilt = window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canTilt) {
    tiltCards.forEach((card) => {
        card.addEventListener('pointermove', (event) => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            const rotateX = y * -2.8;
            const rotateY = x * 3.8;
            card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        });

        card.addEventListener('pointerleave', () => {
            card.style.transform = '';
        });
    });
}

// Marca o item de navegação correspondente à seção atual.
const navLinks = [...document.querySelectorAll('.top-nav a')];
const observedSections = navLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

const navObserver = new IntersectionObserver((entries) => {
    const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    navLinks.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`);
    });
}, { threshold: [0.25, 0.45, 0.65], rootMargin: '-15% 0px -55% 0px' });

observedSections.forEach((section) => navObserver.observe(section));
