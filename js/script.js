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

// Trajetória por scroll: os cartões entram em sequência e a seta percorre o zigue-zague.
const trajectoryFlow = document.getElementById('trajectory-flow');
const trajectorySvg = document.getElementById('trajectory-path-svg');
const trajectoryPath = document.getElementById('trajectory-zigzag-path');
const trajectoryArrow = document.getElementById('trajectory-arrow');
const trajectorySteps = [...document.querySelectorAll('.trajectory-step')];
let trajectoryTicking = false;
let trajectoryPathLength = 0;

const trajectoryStepObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-active');
    });
}, { threshold: 0.34, rootMargin: '0px 0px -8% 0px' });
trajectorySteps.forEach((step) => trajectoryStepObserver.observe(step));

function buildTrajectoryPath() {
    if (!trajectoryFlow || !trajectorySvg || !trajectoryPath || !trajectorySteps.length) return;

    const flowRect = trajectoryFlow.getBoundingClientRect();
    const width = Math.max(1, trajectoryFlow.clientWidth);
    const height = Math.max(1, trajectoryFlow.scrollHeight);
    const mobile = width < 720;
    const centerX = mobile ? 30 : width * 0.5;
    const swing = mobile ? 10 : Math.min(82, width * 0.065);

    const points = trajectorySteps.map((step, index) => {
        const rect = step.getBoundingClientRect();
        const y = rect.top - flowRect.top + rect.height * 0.5;
        let x = centerX;
        if (index > 0) x += (index % 2 === 0 ? -swing : swing);
        return [x, y];
    });

    if (!points.length) return;
    const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ');
    trajectorySvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    trajectorySvg.setAttribute('width', width);
    trajectorySvg.setAttribute('height', height);
    trajectoryPath.setAttribute('d', d);
    trajectoryPathLength = trajectoryPath.getTotalLength();
    trajectoryPath.style.strokeDasharray = `${trajectoryPathLength}`;
    updateTrajectoryScroll();
}

function updateTrajectoryScroll() {
    trajectoryTicking = false;
    if (!trajectoryFlow || !trajectoryPath || !trajectoryArrow || !trajectoryPathLength) return;

    const rect = trajectoryFlow.getBoundingClientRect();
    const start = window.innerHeight * 0.72;
    const end = window.innerHeight * 0.32;
    const total = Math.max(1, rect.height - (start - end));
    const progress = clamp((start - rect.top) / total);
    const drawn = trajectoryPathLength * progress;
    trajectoryPath.style.strokeDashoffset = `${trajectoryPathLength - drawn}`;

    const point = trajectoryPath.getPointAtLength(drawn);
    const nextPoint = trajectoryPath.getPointAtLength(Math.min(trajectoryPathLength, drawn + 1.5));
    const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180 / Math.PI - 90;
    trajectoryArrow.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
    trajectoryArrow.style.opacity = progress > 0.015 ? '1' : '0';
}

function requestTrajectoryUpdate() {
    if (trajectoryTicking) return;
    trajectoryTicking = true;
    requestAnimationFrame(updateTrajectoryScroll);
}

if (trajectoryFlow) {
    buildTrajectoryPath();
    window.addEventListener('load', buildTrajectoryPath, { once: true });
    window.addEventListener('resize', buildTrajectoryPath, { passive: true });
    window.addEventListener('scroll', requestTrajectoryUpdate, { passive: true });
}

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
