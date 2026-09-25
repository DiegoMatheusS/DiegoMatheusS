(() => {
    const host = document.getElementById('sphere-test-canvas');
    const shell = document.getElementById('sphere-test-shell');
    const scarfEl = document.getElementById('sphere-scarf');
    const accessoryEl = document.getElementById('sphere-accessory');
    const angelHaloEl = document.getElementById('angel-halo');
    const explosionEl = document.getElementById('sphere-explosion');
    const projectsTrigger = document.getElementById('projects-trigger');
    const stage5Sections = ['trajetoria', 'experiencia', 'habilidades', 'projetos', 'contato']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    if (!host || !shell) return;

    const THREE_URLS = [
        'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
        'https://unpkg.com/three@0.128.0/build/three.min.js'
    ];

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async function ensureThree() {
        if (window.THREE) return true;
        for (const url of THREE_URLS) {
            try {
                await loadScript(url);
                if (window.THREE) return true;
            } catch (_) {}
        }
        return false;
    }

    ensureThree().then(ok => {
        if (!ok) {
            const error = document.createElement('p');
            error.className = 'sphere-load-error';
            error.textContent = 'Não foi possível carregar o 3D. Verifique a conexão e recarregue.';
            shell.appendChild(error);
            return;
        }
        initSphere(window.THREE);
    });

    function initSphere(THREE) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 60);
        camera.position.set(0, 0, 6.15);

        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute('aria-label', 'Sphere LED 3D interativa');
        host.replaceChildren(renderer.domElement);

        const RADIUS = 1.48;
        const LED_COUNT = 120000;
        const sphereGroup = new THREE.Group();
        scene.add(sphereGroup);

        const positions = new Float32Array(LED_COUNT * 3);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < LED_COUNT; i++) {
            const y = 1 - (i / (LED_COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            positions[i * 3] = Math.cos(theta) * r * RADIUS;
            positions[i * 3 + 1] = y * RADIUS;
            positions[i * 3 + 2] = Math.sin(theta) * r * RADIUS;
        }
        const ledGeometry = new THREE.BufferGeometry();
        ledGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const uniforms = {
            uTime: { value: 0 },
            uLook: { value: new THREE.Vector2(0, 0) },
            uBlinkLeft: { value: 1 },
            uBlinkRight: { value: 1 },
            uMouthOpen: { value: 0 },
            uHover: { value: 0 },
            uExpression: { value: 0 },
            uExprProgress: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
            uPointScale: { value: 1 },
            uGlow: { value: 0 }
        };

        const vertexShader = `
            uniform float uPixelRatio;
            uniform float uPointScale;
            varying vec3 vObjPos;
            varying float vDepthLight;

            void main() {
                vObjPos = position / ${RADIUS.toFixed(2)};
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                float depth = max(2.0, -mv.z);
                gl_PointSize = (2.05 * uPixelRatio * uPointScale) * (6.1 / depth);
                gl_Position = projectionMatrix * mv;

                vec3 n = normalize(position);
                vec3 lightDir = normalize(vec3(-0.48, 0.72, 0.64));
                vDepthLight = 0.72 + max(dot(n, lightDir), 0.0) * 0.42;
            }
        `;

        const fragmentShader = `
            precision highp float;
            uniform float uTime;
            uniform vec2 uLook;
            uniform float uBlinkLeft;
            uniform float uBlinkRight;
            uniform float uMouthOpen;
            uniform float uHover;
            uniform float uExpression;
            uniform float uExprProgress;
            uniform float uGlow;
            varying vec3 vObjPos;
            varying float vDepthLight;

            float ellipse(vec2 p, vec2 c, vec2 r) {
                vec2 q = (p - c) / r;
                return length(q);
            }
            float fillEllipse(vec2 p, vec2 c, vec2 r, float soft) {
                return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, ellipse(p, c, r));
            }
            float lineMask(float d, float w, float soft) {
                return 1.0 - smoothstep(w, w + soft, abs(d));
            }
            float heartMask(vec2 p, vec2 c, vec2 s) {
                // Coração contínuo (sem recortar topo ou ponta inferior).
                vec2 q = (p - c) / s;
                q.y += 0.08;
                float x = q.x * 1.02;
                float y = q.y;
                float a = x * x + y * y - 1.0;
                float h = a * a * a - x * x * y * y * y;
                // Mais nítido: usa os LEDs normais para desenhar o coração, sem cara de tinta sólida.
                return 1.0 - smoothstep(-0.016, 0.016, h);
            }
            float starMask(vec2 p, vec2 c, float s) {
                vec2 q = (p - c) / s;
                float a = atan(q.y, q.x);
                float r = length(q);
                float spikes = 0.58 + 0.24 * cos(5.0 * a);
                return 1.0 - smoothstep(spikes - 0.075, spikes + 0.055, r);
            }
            float swirlMask(vec2 p, vec2 c, float s) {
                vec2 q = (p - c) / s;
                float a = atan(q.y, q.x);
                float r = length(q);
                float t = (a + 3.14159) / 6.28318;
                float arm = abs(r - (0.12 + 0.16 * t));
                float spiral = 1.0 - smoothstep(0.018, 0.050, arm);
                spiral *= 1.0 - smoothstep(0.90, 1.05, r);
                return spiral;
            }
            float cloudPuff(vec2 p, vec2 c, vec2 r, float soft) {
                return fillEllipse(p, c, r, soft);
            }

            void main() {
                vec2 pc = gl_PointCoord - 0.5;
                float d = length(pc);
                if (d > 0.5) discard;

                float dotAlpha = 1.0 - smoothstep(0.36, 0.50, d);
                float core = 1.0 - smoothstep(0.0, 0.31, d);
                float glowAlpha = (1.0 - smoothstep(0.04, 0.50, d)) * 0.18;

                vec3 yellow = vec3(1.0, 0.72, 0.015);
                vec3 warmYellow = vec3(1.0, 0.84, 0.055);
                vec3 color = mix(yellow, warmYellow, core * 0.38) * vDepthLight;

                vec2 p = vObjPos.xy;
                float front = smoothstep(0.18, 0.42, vObjPos.z);
                vec2 look = clamp(uLook, vec2(-1.0), vec2(1.0));
                float exprEase = smoothstep(0.0, 1.0, clamp(uExprProgress, 0.0, 1.0));

                float wide = step(0.5, uExpression) * (1.0 - step(1.5, uExpression));
                float squint = step(1.5, uExpression) * (1.0 - step(2.5, uExpression));
                float winkL = step(2.5, uExpression) * (1.0 - step(3.5, uExpression));
                float winkR = step(3.5, uExpression) * (1.0 - step(4.5, uExpression));
                float meh = step(4.5, uExpression) * (1.0 - step(5.5, uExpression));
                float happy = step(5.5, uExpression) * (1.0 - step(6.5, uExpression));
                float sleepy = step(6.5, uExpression) * (1.0 - step(7.5, uExpression));
                float tinyO = step(7.5, uExpression) * (1.0 - step(8.5, uExpression));
                float laugh = step(8.5, uExpression) * (1.0 - step(9.5, uExpression));
                float sad = step(9.5, uExpression) * (1.0 - step(10.5, uExpression));
                float angry = step(10.5, uExpression) * (1.0 - step(11.5, uExpression));
                float cross = step(11.5, uExpression) * (1.0 - step(12.5, uExpression));
                float sideEye = step(12.5, uExpression) * (1.0 - step(13.5, uExpression));
                float kiss = step(13.5, uExpression) * (1.0 - step(14.5, uExpression));
                float grin = step(14.5, uExpression) * (1.0 - step(15.5, uExpression));
                float confused = step(15.5, uExpression) * (1.0 - step(16.5, uExpression));
                float cry = step(16.5, uExpression) * (1.0 - step(17.5, uExpression));
                float blush = step(17.5, uExpression) * (1.0 - step(18.5, uExpression));
                float furious = step(18.5, uExpression) * (1.0 - step(19.5, uExpression));
                float heartEyes = step(19.5, uExpression) * (1.0 - step(20.5, uExpression));
                float cool = step(20.5, uExpression) * (1.0 - step(21.5, uExpression));
                float laughTears = step(21.5, uExpression) * (1.0 - step(22.5, uExpression));
                float tongueFun = step(22.5, uExpression) * (1.0 - step(23.5, uExpression));
                float nauseous = step(23.5, uExpression) * (1.0 - step(24.5, uExpression));
                float worried = step(24.5, uExpression) * (1.0 - step(25.5, uExpression));
                float angel = step(25.5, uExpression) * (1.0 - step(26.5, uExpression));
                float nerd = step(26.5, uExpression) * (1.0 - step(27.5, uExpression));
                float thinking = step(27.5, uExpression) * (1.0 - step(28.5, uExpression));
                float eyeRoll = step(28.5, uExpression) * (1.0 - step(29.5, uExpression));
                float starEyes = step(29.5, uExpression) * (1.0 - step(30.5, uExpression));
                float scream = step(30.5, uExpression) * (1.0 - step(31.5, uExpression));
                float freezing = step(31.5, uExpression) * (1.0 - step(32.5, uExpression));
                float money = step(32.5, uExpression) * (1.0 - step(33.5, uExpression));
                float pleading = step(33.5, uExpression) * (1.0 - step(34.5, uExpression));
                float dizzy = step(34.5, uExpression) * (1.0 - step(35.5, uExpression));
                float smug = step(35.5, uExpression) * (1.0 - step(36.5, uExpression));
                float impressed = step(36.5, uExpression) * (1.0 - step(37.5, uExpression));
                float starJoy = step(37.5, uExpression) * (1.0 - step(38.5, uExpression));
                float shockBlue = step(38.5, uExpression) * (1.0 - step(39.5, uExpression));
                float explodeHead = step(39.5, uExpression) * (1.0 - step(40.5, uExpression));
                float devil = step(40.5, uExpression) * (1.0 - step(41.5, uExpression));

                // A quebra acontece na própria casca da esfera, em coordenadas 3D.
                // Conforme a emoção entra, o topo abre com borda irregular e revela o núcleo preto.
                float fractureProgress = explodeHead * smoothstep(0.08, 0.42, exprEase);
                float fractureAngle = atan(vObjPos.z, vObjPos.x);
                float fractureBoundary = 0.635
                    + 0.052 * sin(fractureAngle * 5.0 + 0.65)
                    + 0.032 * sin(fractureAngle * 9.0 - 1.15)
                    + 0.020 * sin(vObjPos.x * 19.0 + vObjPos.z * 16.0);
                float fractureOpenBoundary = mix(1.08, fractureBoundary, fractureProgress);
                float fractureHole = step(fractureOpenBoundary, vObjPos.y) * explodeHead;
                float fractureEdge = (1.0 - smoothstep(0.016, 0.070, abs(vObjPos.y - fractureOpenBoundary))) * fractureProgress;
                if (fractureHole > 0.5) discard;

                float angerMorph = clamp(exprEase * 1.15, 0.0, 1.0);
                float rage = clamp(furious + angry * angerMorph, 0.0, 1.0);
                float angryHeat = clamp(angry * (0.24 + 0.58 * angerMorph) + furious, 0.0, 1.0);
                float redSweep = 1.0 - smoothstep(-0.78 + exprEase * 1.52, -0.52 + exprEase * 1.52, p.y);
                float redEdge = smoothstep(0.26, 0.96, length(p * vec2(0.94, 1.02)));
                float redMask = clamp(redSweep * 0.78 + redEdge * 0.22, 0.0, 1.0) * front * angryHeat;
                vec3 angerTint = mix(vec3(1.0, 0.74, 0.10), vec3(0.95, 0.16, 0.12), redMask);
                color = mix(color, angerTint * vDepthLight, redMask * 0.92);
                color = mix(color, vec3(0.76, 1.0, 0.52) * vDepthLight, nauseous * 0.52 * exprEase);
                float coldTop = smoothstep(-0.15, 0.85, p.y) * freezing * exprEase * front;
                color = mix(color, vec3(0.35, 0.78, 1.0) * vDepthLight, coldTop * 0.66);
                float screamTop = smoothstep(0.28, 0.90, p.y) * scream * exprEase * front;
                color = mix(color, vec3(0.50, 0.78, 1.0) * vDepthLight, screamTop * 0.30);
                float shockBlueTop = smoothstep(0.08, 0.86, p.y) * shockBlue * exprEase * front;
                color = mix(color, vec3(0.40, 0.76, 1.0) * vDepthLight, shockBlueTop * 0.88);

                // Capetinha: todas as luzes migram gradualmente do amarelo para roxo.
                float devilPurple = devil * exprEase;
                vec3 devilBody = mix(vec3(0.54, 0.07, 0.76), vec3(0.78, 0.12, 0.94), core * 0.42);
                color = mix(color, devilBody * vDepthLight, devilPurple * 0.96);

                float explodeWarmTop = smoothstep(0.25, 0.88, p.y) * explodeHead * exprEase * front;
                color = mix(color, vec3(1.0, 0.80, 0.24) * vDepthLight, explodeWarmTop * 0.16);
                // LEDs imediatamente abaixo da rachadura ficam quentes, como borda recém-rompida.
                color = mix(color, vec3(1.0, 0.93, 0.46) * (vDepthLight * 1.06), fractureEdge * 0.96);
                float fractureEdgeWhite = (1.0 - smoothstep(0.008, 0.026, abs(vObjPos.y - fractureOpenBoundary))) * fractureProgress;
                color = mix(color, vec3(1.34, 1.34, 1.30), fractureEdgeWhite * 0.92);

                float baseEyeY = 0.205;
                baseEyeY *= mix(1.0, 1.26, wide * exprEase);
                baseEyeY *= mix(1.0, 0.58, (squint + angry * (0.40 + 0.26 * angerMorph) + laugh * 0.45 + sideEye * 0.35 + grin * 0.28 + rage * 0.62 + confused * 0.12 + cool * 0.18 + laughTears * 0.22 + nauseous * 0.16) * exprEase);
                baseEyeY *= mix(1.0, 0.60, devil * exprEase);
                baseEyeY *= mix(1.0, 0.72, sleepy * exprEase);
                baseEyeY *= mix(1.0, 1.18, (worried + scream * 0.35 + starEyes * 0.12 + pleading * 0.32) * exprEase);
                baseEyeY *= mix(1.0, 1.06, (heartEyes + cry * 0.10 + nerd * 0.06 + starJoy * 0.10) * exprEase);
                baseEyeY *= mix(1.0, 0.80, (thinking * 0.20 + eyeRoll * 0.18 + freezing * 0.28 + smug * 0.16) * exprEase);
                baseEyeY *= mix(1.0, 1.34, (impressed + shockBlue + explodeHead * 0.72) * exprEase);
                baseEyeY *= mix(1.0, 0.92, (happy + blush * 0.22) * exprEase);
                baseEyeY *= mix(1.0, 1.08, (sad + cry * 0.18) * exprEase);
                baseEyeY *= mix(1.0, 0.88, kiss * exprEase);

                vec2 leftC = vec2(-0.285, 0.19);
                vec2 rightC = vec2(0.285, 0.19);
                // Limita o topo do branco do olho antes da região das sobrancelhas.
                float eyeWhiteTop = 0.350 + 0.045 * (impressed + shockBlue + explodeHead * 0.70);
                float maxEyeWhiteRadiusY = max(0.060, eyeWhiteTop - leftC.y);
                vec2 eyeRLeft = vec2(0.155, min(baseEyeY, maxEyeWhiteRadiusY) * max(uBlinkLeft, 0.018));
                vec2 eyeRRight = vec2(0.155, min(baseEyeY, maxEyeWhiteRadiusY) * max(uBlinkRight, 0.018));
                // Na piscadinha de um olho, removemos o branco daquele olho e desenhamos um risco preto.
                float specialEyeBlend = smoothstep(0.28, 0.44, exprEase);
                float specialEyeMask = clamp(heartEyes + cool + starEyes + starJoy + money + dizzy + shockBlue + explodeHead, 0.0, 1.0) * specialEyeBlend;
                float leftEye = fillEllipse(p, leftC, eyeRLeft, 0.035) * front * (1.0 - winkL) * (1.0 - specialEyeMask);
                float rightEye = fillEllipse(p, rightC, eyeRRight, 0.035) * front * (1.0 - winkR) * (1.0 - specialEyeMask);
                float eyes = max(leftEye, rightEye);

                float winkWidth = 0.135;
                float winkLineLeft = lineMask(p.y - (leftC.y - 0.004), 0.014, 0.009) *
                    (1.0 - smoothstep(winkWidth, winkWidth + 0.020, abs(p.x - leftC.x))) * winkL * front;
                float winkLineRight = lineMask(p.y - (rightC.y - 0.004), 0.014, 0.009) *
                    (1.0 - smoothstep(winkWidth, winkWidth + 0.020, abs(p.x - rightC.x))) * winkR * front;
                float winkLines = max(winkLineLeft, winkLineRight);

                vec2 pupilOffset = vec2(look.x * 0.092, look.y * 0.118);
                pupilOffset.y += sad * -0.012 + cry * -0.010 + worried * -0.020 + nauseous * -0.006
                    + thinking * 0.075 + eyeRoll * 0.105 + scream * 0.018 + pleading * -0.024 + smug * -0.008 + impressed * 0.010
                    + devil * 0.014;
                pupilOffset.x += sideEye * 0.055 + confused * 0.024 - rage * 0.015 + worried * 0.004
                    + thinking * 0.052 - eyeRoll * 0.018 + smug * 0.050;
                vec2 crossOffsetL = vec2(0.070, -0.030) * cross;
                vec2 crossOffsetR = vec2(-0.070, -0.030) * cross;
                vec2 kissOffset = vec2(0.0, -0.010) * kiss;
                float blinkAverage = max((uBlinkLeft + uBlinkRight) * 0.5, 0.07);
                vec2 pupilR = vec2(0.055, 0.064 * blinkAverage);
                pupilR *= mix(1.0, 1.10, wide + happy * 0.35 + impressed * 0.35);
                pupilR *= mix(1.0, 0.92, angry + laugh * 0.2 + grin * 0.18 + rage * 0.22);
                pupilR *= mix(1.0, 0.84, cool);
                pupilR *= mix(1.0, 1.12, worried);
                pupilR *= mix(1.0, 0.82, (impressed + shockBlue + explodeHead * 0.4));
                pupilR *= mix(1.0, 0.76, devil * exprEase);
                float lp = fillEllipse(p, leftC + pupilOffset + crossOffsetL + kissOffset, pupilR, 0.045) * leftEye * (1.0 - winkL) * (1.0 - specialEyeMask);
                float rp = fillEllipse(p, rightC + pupilOffset + crossOffsetR + kissOffset, pupilR, 0.045) * rightEye * (1.0 - winkR) * (1.0 - specialEyeMask);
                float pupils = max(lp, rp);

                // Sobrancelhas acompanham o olhar com mais precisão: elas seguem parte do movimento real das pupilas.
                float browFollowLeftX = pupilOffset.x * 0.44 + crossOffsetL.x * 0.20;
                float browFollowRightX = pupilOffset.x * 0.44 + crossOffsetR.x * 0.20;
                float browFollowLeftY = pupilOffset.y * 0.28;
                float browFollowRightY = pupilOffset.y * 0.28;
                float browLookLift = max(look.y, 0.0) * 0.024;
                float browLookDrop = max(-look.y, 0.0) * 0.016;
                float browLookTilt = look.x * 0.030;
                float browBaseLift = wide * 0.050 + happy * 0.010 + sad * 0.014 - sleepy * 0.018 - angry * 0.006 - rage * 0.010 + laugh * 0.004
                    + cry * 0.008 + blush * 0.006 + worried * 0.014 + scream * 0.052 + angel * 0.018 + starEyes * 0.022 + pleading * 0.040 + dizzy * 0.010
                    + impressed * 0.090 + starJoy * 0.062 + shockBlue * 0.104 + explodeHead * 0.082 - devil * 0.016;
                float browLiftLeft = browBaseLift + winkL * 0.022 + sideEye * 0.016 + browFollowLeftY + browLookLift - browLookDrop + cry * 0.020 + blush * 0.008;
                float browLiftRight = browBaseLift + winkR * 0.022 - sideEye * 0.004 + browFollowRightY + browLookLift - browLookDrop + cry * 0.004 + blush * 0.008;
                float browSlopeLeft = -angry * (0.16 + 0.10 * angerMorph) - rage * 0.30 + sad * 0.09 + cross * 0.05 + sideEye * 0.06 - happy * 0.02 + sleepy * 0.03 + confused * 0.14 + cry * 0.08
                    + thinking * 0.16 + eyeRoll * 0.08 + nerd * 0.03 + pleading * 0.16 - smug * 0.04 + impressed * 0.010 + starJoy * 0.010 + shockBlue * 0.006 + explodeHead * 0.005
                    - devil * 0.24 + browLookTilt * 0.35;
                float browSlopeRight = angry * (0.16 + 0.10 * angerMorph) + rage * 0.30 - sad * 0.09 - cross * 0.05 - sideEye * 0.02 + happy * 0.02 - sleepy * 0.03 - confused * 0.05 - cry * 0.02
                    - thinking * 0.05 - eyeRoll * 0.08 - nerd * 0.03 - pleading * 0.16 - smug * 0.10 - impressed * 0.010 - starJoy * 0.010 - shockBlue * 0.006 - explodeHead * 0.005
                    + devil * 0.24 + browLookTilt * 0.35;
                float browThickness = 0.018 + angry * 0.003 + rage * 0.006 + sleepy * 0.002 + wide * 0.002 + cool * 0.001 + impressed * 0.002 + shockBlue * 0.003;
                float browSoftness = 0.011 + happy * 0.001;
                float browHalfWidth = 0.165 + happy * 0.010 + sleepy * 0.006 - tinyO * 0.012 + furious * 0.010 + impressed * 0.022 + starJoy * 0.018 + shockBlue * 0.020;
                float browCurveLeft = -0.004 * happy - 0.004 * laugh + 0.007 * sad + 0.004 * sleepy + cry * 0.010 - impressed * 0.018 - starJoy * 0.012 - shockBlue * 0.022 - explodeHead * 0.018 - browLookLift * 0.35;
                float browCurveRight = -0.004 * happy - 0.004 * laugh + 0.007 * sad + 0.004 * sleepy + cry * 0.004 - impressed * 0.018 - starJoy * 0.012 - shockBlue * 0.022 - explodeHead * 0.018 - browLookLift * 0.35;
                float leftBrowCenterX = leftC.x + browFollowLeftX;
                float rightBrowCenterX = rightC.x + browFollowRightX;
                float browXL = (p.x - leftBrowCenterX) / browHalfWidth;
                float browXR = (p.x - rightBrowCenterX) / browHalfWidth;
                float browYL = 0.382 + browLiftLeft + browSlopeLeft * (p.x - leftBrowCenterX) + browCurveLeft * browXL * browXL;
                float browYR = 0.382 + browLiftRight + browSlopeRight * (p.x - rightBrowCenterX) + browCurveRight * browXR * browXR;
                float browRangeL = 1.0 - smoothstep(browHalfWidth, browHalfWidth + 0.030, abs(p.x - leftBrowCenterX));
                float browRangeR = 1.0 - smoothstep(browHalfWidth, browHalfWidth + 0.030, abs(p.x - rightBrowCenterX));
                float browL = lineMask(p.y - browYL, browThickness, browSoftness) * browRangeL * front;
                float browR = lineMask(p.y - browYR, browThickness, browSoftness) * browRangeR * front;
                float brows = max(browL, browR) * (1.0 - specialEyeMask);

                // Uma única boca por estado. Estados abertos nunca desenham o sorriso junto.
                float expressionSum = clamp((wide + squint + winkL + winkR + meh + happy + sleepy + tinyO + laugh + sad + angry + cross + sideEye + kiss + grin + confused + cry + blush + furious + heartEyes + cool + laughTears + tongueFun + nauseous + worried + angel + nerd + thinking + eyeRoll + starEyes + scream + freezing + money + pleading + dizzy + smug + impressed + starJoy + shockBlue + explodeHead + devil), 0.0, 1.0);
                float hasEmotion = step(0.5, expressionSum);
                // Há uma pequena troca limpa: o neutro sai antes da boca/efeito emocional entrar.
                float neutral = 1.0 - hasEmotion * smoothstep(0.10, 0.24, exprEase);
                float emotionFace = smoothstep(0.26, 0.42, exprEase);
                float openAmount = smoothstep(0.03, 0.92, uMouthOpen);

                float mouthHalf = mix(0.082, 0.108, uHover);
                float mouthCurve = -0.245 - 0.045 * (1.0 - (p.x / mouthHalf) * (p.x / mouthHalf));
                float mouthRange = 1.0 - smoothstep(mouthHalf, mouthHalf + 0.013, abs(p.x));
                float neutralSmile = lineMask(p.y - mouthCurve, 0.010, 0.007) * mouthRange * front * (neutral + 0.78 * max(winkL, winkR));

                float surprisedOpen = fillEllipse(p, vec2(0.0, -0.265), vec2(0.028 + 0.045 * openAmount, 0.028 + 0.045 * openAmount), 0.040) * front * wide;
                float crossOpen = fillEllipse(p, vec2(0.0, -0.268), vec2(0.027 + 0.042 * openAmount, 0.027 + 0.042 * openAmount), 0.040) * front * cross;
                float laughOpen = fillEllipse(p, vec2(0.0, -0.270), vec2(0.040 + 0.046 * openAmount, 0.040 + 0.046 * openAmount), 0.044) * front * laugh;
                float tinyOpen = fillEllipse(p, vec2(0.0, -0.262), vec2(0.020 + 0.024 * openAmount, 0.020 + 0.024 * openAmount), 0.040) * front * tinyO;
                float kissOpen = fillEllipse(p, vec2(0.0, -0.257), vec2(0.032 + 0.032 * openAmount, 0.032 + 0.032 * openAmount), 0.036) * front * kiss;

                float happyHalf = 0.125;
                float happyCurve = -0.250 - 0.050 * (1.0 - (p.x / happyHalf) * (p.x / happyHalf));
                float happyRange = 1.0 - smoothstep(happyHalf, happyHalf + 0.015, abs(p.x));
                float happyLine = lineMask(p.y - happyCurve, 0.011, 0.008) * happyRange * front * happy * (1.0 - openAmount);
                float happyOpen = fillEllipse(p, vec2(0.0, -0.265), vec2(0.032 + 0.036 * openAmount, 0.032 + 0.036 * openAmount), 0.040) * front * happy * openAmount;

                float sleepyLine = lineMask(p.y + 0.255, 0.009, 0.007) *
                    (1.0 - smoothstep(0.10, 0.13, abs(p.x))) * front * sleepy;
                float sideLine = lineMask(p.y + 0.268 + p.x * 0.020, 0.009, 0.007) *
                    (1.0 - smoothstep(0.12, 0.145, abs(p.x))) * front * sideEye;
                float grinLine = lineMask(p.y + 0.240 - 0.050 * (1.0 - (p.x / 0.140) * (p.x / 0.140)), 0.011, 0.008) *
                    (1.0 - smoothstep(0.155, 0.175, abs(p.x))) * front * grin;
                float sadLine = lineMask(p.y + 0.225 + 0.045 * (1.0 - (p.x / 0.095) * (p.x / 0.095)), 0.010, 0.007) *
                    (1.0 - smoothstep(0.105, 0.125, abs(p.x))) * front * sad;
                float angryLine = lineMask(p.y + 0.220 + 0.060 * (1.0 - (p.x / 0.115) * (p.x / 0.115)), 0.011, 0.008) *
                    (1.0 - smoothstep(0.115, 0.138, abs(p.x))) * front * angry;
                float mehLine = lineMask(p.y + 0.268, 0.010, 0.007) *
                    (1.0 - smoothstep(0.12, 0.145, abs(p.x))) * front * meh;
                float confusedLine = lineMask(p.y + 0.254 - p.x * 0.020, 0.010, 0.007) *
                    (1.0 - smoothstep(0.12, 0.145, abs(p.x))) * front * confused;
                float cryLine = lineMask(p.y + 0.220 + 0.055 * (1.0 - (p.x / 0.095) * (p.x / 0.095)), 0.010, 0.007) *
                    (1.0 - smoothstep(0.105, 0.125, abs(p.x))) * front * cry;
                float blushLine = lineMask(p.y - (-0.250 - 0.043 * (1.0 - (p.x / 0.120) * (p.x / 0.120))), 0.010, 0.007) *
                    (1.0 - smoothstep(0.120, 0.142, abs(p.x))) * front * blush;
                float furiousOpen = 0.0;
                float furiousLine = lineMask(p.y + 0.216 + 0.074 * (1.0 - (p.x / 0.120) * (p.x / 0.120)), 0.011, 0.008) *
                    (1.0 - smoothstep(0.118, 0.142, abs(p.x))) * front * rage * exprEase;
                float heartLine = 0.0;
                float coolLine = lineMask(p.y - (-0.247 - 0.040 * (1.0 - (p.x / 0.138) * (p.x / 0.138))), 0.011, 0.008) *
                    (1.0 - smoothstep(0.138, 0.160, abs(p.x))) * front * cool * exprEase;
                float laughTearsLine = lineMask(p.y - (-0.248 - 0.062 * (1.0 - (p.x / 0.132) * (p.x / 0.132))), 0.011, 0.008) *
                    (1.0 - smoothstep(0.132, 0.154, abs(p.x))) * front * laughTears * exprEase;
                float tongueOuter = fillEllipse(p, vec2(0.0, -0.264), vec2(0.036 + 0.030 * openAmount, 0.036 + 0.030 * openAmount), 0.040) * front * tongueFun * exprEase;
                float nauseousLine = lineMask(p.y + 0.252 + 0.018 * sin((p.x + 0.18) * 26.0), 0.010, 0.007) *
                    (1.0 - smoothstep(0.135, 0.160, abs(p.x))) * front * nauseous;
                float worriedOpen = fillEllipse(p, vec2(0.0, -0.262), vec2(0.024 + 0.022 * openAmount, 0.030 + 0.022 * openAmount), 0.038) * front * worried;
                float angelLine = lineMask(p.y - (-0.248 - 0.048 * (1.0 - (p.x / 0.125) * (p.x / 0.125))), 0.010, 0.007) *
                    (1.0 - smoothstep(0.125, 0.146, abs(p.x))) * front * angel;
                float nerdLine = lineMask(p.y - (-0.238 - 0.038 * (1.0 - (p.x / 0.135) * (p.x / 0.135))), 0.010, 0.007) *
                    (1.0 - smoothstep(0.135, 0.158, abs(p.x))) * front * nerd;
                float thinkingLine = lineMask(p.y + 0.258 + p.x * 0.028, 0.010, 0.007) *
                    (1.0 - smoothstep(0.115, 0.140, abs(p.x))) * front * thinking;
                float eyeRollLine = lineMask(p.y + 0.267, 0.010, 0.007) *
                    (1.0 - smoothstep(0.120, 0.144, abs(p.x))) * front * eyeRoll;
                float starLine = lineMask(p.y - (-0.247 - 0.056 * (1.0 - (p.x / 0.135) * (p.x / 0.135))), 0.011, 0.008) *
                    (1.0 - smoothstep(0.135, 0.158, abs(p.x))) * front * starEyes;
                float screamOpen = fillEllipse(p, vec2(0.0, -0.250), vec2(0.050 + 0.020 * openAmount, 0.083 + 0.032 * openAmount), 0.042) * front * scream;
                float freezeLine = lineMask(p.y + 0.250, 0.014, 0.008) *
                    (1.0 - smoothstep(0.145, 0.165, abs(p.x))) * front * freezing;
                float moneyOpen = fillEllipse(p, vec2(0.0, -0.263), vec2(0.035 + 0.028 * openAmount, 0.035 + 0.028 * openAmount), 0.040) * front * money;
                float pleadingLine = lineMask(p.y + 0.228 + 0.055 * (1.0 - (p.x / 0.090) * (p.x / 0.090)), 0.010, 0.007) *
                    (1.0 - smoothstep(0.102, 0.122, abs(p.x))) * front * pleading;
                float dizzyOpen = fillEllipse(p, vec2(0.0, -0.257), vec2(0.018 + 0.014 * openAmount, 0.040 + 0.010 * openAmount), 0.035) * front * dizzy;
                float smugLine = lineMask(p.y + 0.252 - p.x * 0.028, 0.010, 0.007) *
                    (1.0 - smoothstep(0.128, 0.150, abs(p.x))) * front * smug;

                float devilSmileHalf = 0.178;
                float devilSmileCurve = -0.214 - 0.084 * (1.0 - (p.x / devilSmileHalf) * (p.x / devilSmileHalf));
                float devilSmileRange = 1.0 - smoothstep(devilSmileHalf, devilSmileHalf + 0.020, abs(p.x));
                float devilSmileLine = lineMask(p.y - devilSmileCurve, 0.015, 0.010) * devilSmileRange * front * devil * exprEase;
                float impressedOpen = fillEllipse(p, vec2(0.0, -0.236), vec2(0.040 + 0.064 * openAmount, 0.070 + 0.090 * openAmount), 0.040) * front * impressed;
                float starJoyHalf = 0.175;
                float starJoyCurve = -0.222 - 0.086 * (1.0 - (p.x / starJoyHalf) * (p.x / starJoyHalf));
                float starJoyRange = 1.0 - smoothstep(starJoyHalf, starJoyHalf + 0.018, abs(p.x));
                float starJoyLine = lineMask(p.y - starJoyCurve, 0.014, 0.009) * starJoyRange * front * starJoy;
                float shockBlueOpen = fillEllipse(p, vec2(0.0, -0.230), vec2(0.042 + 0.068 * openAmount, 0.076 + 0.100 * openAmount), 0.042) * front * shockBlue;
                float explodeOpen = fillEllipse(p, vec2(0.0, -0.238), vec2(0.030 + 0.038 * openAmount, 0.046 + 0.050 * openAmount), 0.040) * front * explodeHead;

                float openMouth = max(max(max(surprisedOpen, crossOpen), max(laughOpen, tinyOpen)),
                    max(max(max(kissOpen, happyOpen), furiousOpen), max(max(tongueOuter, worriedOpen), max(max(screamOpen, moneyOpen), max(dizzyOpen, max(impressedOpen, max(shockBlueOpen, explodeOpen)))))));
                float emotionLineMouth = max(max(max(happyLine, sleepyLine), max(sideLine, grinLine)),
                    max(max(max(max(sadLine, angryLine), max(mehLine, confusedLine)), max(max(cryLine, blushLine), max(furiousLine, heartLine))),
                    max(max(max(coolLine, laughTearsLine), max(nauseousLine, angelLine)), max(max(nerdLine, thinkingLine), max(max(eyeRollLine, starLine), max(max(freezeLine, pleadingLine), max(max(smugLine, starJoyLine), devilSmileLine)))))));
                float customMouth = max(openMouth, emotionLineMouth * emotionFace);
                float mouthOverrideMode = clamp(meh + happy + sleepy + tinyO + laugh + sad + angry + cross + sideEye + kiss + grin + confused + cry + blush + furious + cool + laughTears + tongueFun + nauseous + worried + angel + nerd + thinking + eyeRoll + starEyes + scream + freezing + money + pleading + dizzy + smug + impressed + starJoy + shockBlue + explodeHead + devil, 0.0, 1.0);
                float mouth = max(neutralSmile * (1.0 - mouthOverrideMode), customMouth);

                float cheekL = fillEllipse(p, vec2(-0.18, -0.02), vec2(0.085, 0.055), 0.035) * front * blush;
                float cheekR = fillEllipse(p, vec2(0.18, -0.02), vec2(0.085, 0.055), 0.035) * front * blush;
                float devilCheekL = fillEllipse(p, vec2(-0.205, -0.015), vec2(0.074, 0.042), 0.040) * front * devil * exprEase;
                float devilCheekR = fillEllipse(p, vec2(0.205, -0.015), vec2(0.074, 0.042), 0.040) * front * devil * exprEase;
                float cryLeftCorner = fillEllipse(p, leftC + vec2(-0.142, -0.112), vec2(0.031, 0.074), 0.030) * front * cry * exprEase;
                float cryRightCorner = fillEllipse(p, rightC + vec2(0.142, -0.112), vec2(0.031, 0.074), 0.030) * front * cry * exprEase;
                float tears = max(cryLeftCorner, cryRightCorner);
                float laughTearL = fillEllipse(p, leftC + vec2(-0.145, -0.095), vec2(0.029, 0.064), 0.030) * front * laughTears * exprEase;
                float laughTearR = fillEllipse(p, rightC + vec2(0.145, -0.095), vec2(0.029, 0.064), 0.030) * front * laughTears * exprEase;
                float extraTears = max(max(laughTearL, laughTearR), tears);
                float heartL = heartMask(p, leftC + vec2(0.0, 0.016), vec2(0.236, 0.246)) * front * heartEyes * exprEase;
                float heartR = heartMask(p, rightC + vec2(0.0, 0.016), vec2(0.236, 0.246)) * front * heartEyes * exprEase;
                float glassesL = fillEllipse(p, leftC + vec2(-0.008, 0.002), vec2(0.215, 0.158), 0.030) * front * cool * exprEase;
                float glassesR = fillEllipse(p, rightC + vec2(0.008, 0.002), vec2(0.215, 0.158), 0.030) * front * cool * exprEase;
                float glassesBridge = fillEllipse(p, vec2(0.0, 0.180), vec2(0.098, 0.024), 0.030) * front * cool * exprEase;
                float glassesMask = max(max(glassesL, glassesR), glassesBridge);
                float tongueMask = fillEllipse(p, vec2(0.0, -0.292), vec2(0.023 + 0.022 * openAmount, 0.028 + 0.026 * openAmount), 0.040) * front * tongueFun * exprEase;

                float haloMask = 0.0;

                float nerdGlassL = fillEllipse(p, leftC, vec2(0.210, 0.176), 0.030) * front * nerd * exprEase;
                float nerdGlassR = fillEllipse(p, rightC, vec2(0.210, 0.176), 0.030) * front * nerd * exprEase;
                float nerdInnerL = fillEllipse(p, leftC, vec2(0.164, 0.132), 0.030) * front * nerd * exprEase;
                float nerdInnerR = fillEllipse(p, rightC, vec2(0.164, 0.132), 0.030) * front * nerd * exprEase;
                float nerdFrames = max(max(0.0, nerdGlassL - nerdInnerL), max(0.0, nerdGlassR - nerdInnerR));
                float nerdBridge = fillEllipse(p, vec2(0.0, 0.190), vec2(0.095, 0.022), 0.030) * front * nerd * exprEase;
                nerdFrames = max(nerdFrames, nerdBridge);

                float anyStar = clamp(starEyes + starJoy, 0.0, 1.0);
                float starEyeBaseL = 0.0;
                float starEyeBaseR = 0.0;
                float starL = starMask(p, leftC + vec2(0.0, 0.006), 0.218 + 0.045 * starJoy) * front * anyStar * exprEase;
                float starR = starMask(p, rightC + vec2(0.0, 0.006), 0.218 + 0.045 * starJoy) * front * anyStar * exprEase;
                float shockEyeL = fillEllipse(p, leftC + vec2(0.0, 0.006), vec2(0.172, 0.206), 0.032) * front * shockBlue * exprEase;
                float shockEyeR = fillEllipse(p, rightC + vec2(0.0, 0.006), vec2(0.172, 0.206), 0.032) * front * shockBlue * exprEase;
                float explodeEyeL = fillEllipse(p, leftC + vec2(0.0, 0.004), vec2(0.165, 0.202), 0.032) * front * explodeHead * exprEase;
                float explodeEyeR = fillEllipse(p, rightC + vec2(0.0, 0.004), vec2(0.165, 0.202), 0.032) * front * explodeHead * exprEase;
                float dizzyL = swirlMask(p, leftC, 0.170) * front * dizzy * exprEase;
                float dizzyR = swirlMask(p, rightC, 0.170) * front * dizzy * exprEase;
                // A nuvem não é mais desenhada sobre a testa.
                // Agora ela é geometria 3D que nasce do buraco real no topo.
                float explodeCloud = 0.0;
                float explodeCap = 0.0;
                float explodeBurst = 0.0;

                float moneyEyeL = fillEllipse(p, leftC, vec2(0.145, 0.135), 0.035) * front * money * exprEase;
                float moneyEyeR = fillEllipse(p, rightC, vec2(0.145, 0.135), 0.035) * front * money * exprEase;
                float dollarBarL = lineMask(p.x - leftC.x, 0.015, 0.008) *
                    (1.0 - smoothstep(0.100, 0.130, abs(p.y - leftC.y))) * front * money * exprEase;
                float dollarBarR = lineMask(p.x - rightC.x, 0.015, 0.008) *
                    (1.0 - smoothstep(0.100, 0.130, abs(p.y - rightC.y))) * front * money * exprEase;
                float dollarCrossL = lineMask(p.y - leftC.y, 0.013, 0.008) *
                    (1.0 - smoothstep(0.085, 0.112, abs(p.x - leftC.x))) * front * money * exprEase;
                float dollarCrossR = lineMask(p.y - rightC.y, 0.013, 0.008) *
                    (1.0 - smoothstep(0.085, 0.112, abs(p.x - rightC.x))) * front * money * exprEase;
                float dollarMask = max(max(dollarBarL, dollarBarR), max(dollarCrossL, dollarCrossR));

                float freezeToothL = fillEllipse(p, vec2(-0.048, -0.250), vec2(0.043, 0.030), 0.025) * front * freezing * exprEase;
                float freezeToothR = fillEllipse(p, vec2(0.048, -0.250), vec2(0.043, 0.030), 0.025) * front * freezing * exprEase;
                float freezeTeeth = max(freezeToothL, freezeToothR);

                vec3 eyeWhite = vec3(1.24, 1.24, 1.22);
                vec3 ink = vec3(0.025, 0.025, 0.024);
                vec3 mouthBlack = vec3(0.006, 0.006, 0.006);
                vec3 cheekColor = vec3(1.0, 0.58, 0.63);
                vec3 tearColor = vec3(0.52, 0.88, 1.0);
                vec3 heartColor = vec3(1.0, 0.0, 0.02);
                vec3 glassesColor = vec3(0.03, 0.03, 0.04);
                vec3 tongueColor = vec3(0.98, 0.48, 0.62);
                vec3 haloColor = vec3(0.36, 0.88, 1.0);
                vec3 starColor = vec3(1.0, 0.94, 0.18);
                vec3 moneyColor = vec3(0.19, 0.70, 0.30);
                vec3 pleadingShine = vec3(0.86, 0.96, 1.0);
                vec3 starDeep = vec3(0.98, 0.70, 0.05);
                vec3 cloudColor = vec3(0.78, 0.91, 1.0);
                vec3 burstColor = vec3(1.0, 0.46, 0.12);
                color = mix(color, cheekColor, max(cheekL, cheekR) * 0.55);
                color = mix(color, vec3(1.0, 0.10, 0.46), max(devilCheekL, devilCheekR) * 0.38);
                color = mix(color, eyeWhite, eyes);
                color = mix(color, eyeWhite, max(max(starEyeBaseL, starEyeBaseR), max(max(shockEyeL, shockEyeR), max(explodeEyeL, explodeEyeR))));
                color = mix(color, vec3(1.42, 1.42, 1.40), max(explodeEyeL, explodeEyeR));
                color = mix(color, heartColor, max(heartL, heartR));
                color = mix(color, vec3(1.16, 0.04, 0.08), max(heartL, heartR) * 0.18);
                color = mix(color, glassesColor, glassesMask);
                color = mix(color, haloColor, haloMask);
                color = mix(color, ink, nerdFrames);
                color = mix(color, starColor, max(starL, starR) * 0.42);
                color = mix(color, starDeep, max(starL, starR));
                color = mix(color, moneyColor, max(moneyEyeL, moneyEyeR));
                color = mix(color, eyeWhite, dollarMask);
                color = mix(color, pleadingShine, max(leftEye, rightEye) * pleading * 0.22 * exprEase);
                color = mix(color, cloudColor, explodeCloud);
                color = mix(color, mouthBlack, explodeCap * 0.90);
                color = mix(color, burstColor, explodeBurst * 0.72);
                color = mix(color, ink, max(max(max(pupils, brows), winkLines), max(dizzyL, dizzyR)));
                color = mix(color, vec3(0.92, 0.02, 0.10), pupils * devil * exprEase * 0.78);
                color = mix(color, mouthBlack, mouth);
                color = mix(color, tongueColor, tongueMask);
                color = mix(color, eyeWhite, freezeTeeth);
                color = mix(color, tearColor, extraTears);

                float pulse = 0.022 * sin(uTime * 1.85 + vObjPos.y * 2.6);
                color += yellow * pulse;

                if (uGlow > 0.5) {
                    vec3 glowColor = color * 1.12;
                    gl_FragColor = vec4(glowColor, glowAlpha);
                } else {
                    gl_FragColor = vec4(color, dotAlpha);
                }
            }
        `;

        const coreMaterial = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            depthTest: true,
            depthWrite: true,
            blending: THREE.NormalBlending
        });

        const glowUniforms = {
            ...uniforms,
            uPointScale: { value: 1.24 },
            uGlow: { value: 1 }
        };
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: glowUniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const glowLeds = new THREE.Points(ledGeometry, glowMaterial);
        glowLeds.renderOrder = 1;
        sphereGroup.add(glowLeds);

        const leds = new THREE.Points(ledGeometry, coreMaterial);
        leds.renderOrder = 2;
        sphereGroup.add(leds);

        // Esfera interna preta com pontos discretos para bloquear a luz traseira.
        const INNER_RADIUS = RADIUS * 0.91;
        const INNER_COUNT = 30000;
        const innerPositions = new Float32Array(INNER_COUNT * 3);
        for (let i = 0; i < INNER_COUNT; i++) {
            const y = 1 - (i / (INNER_COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            innerPositions[i * 3] = Math.cos(theta) * r * INNER_RADIUS;
            innerPositions[i * 3 + 1] = y * INNER_RADIUS;
            innerPositions[i * 3 + 2] = Math.sin(theta) * r * INNER_RADIUS;
        }
        const innerGeometry = new THREE.BufferGeometry();
        innerGeometry.setAttribute('position', new THREE.BufferAttribute(innerPositions, 3));
        const innerMaterial = new THREE.PointsMaterial({
            color: 0x050505,
            size: 0.010,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.82,
            depthTest: true,
            depthWrite: true
        });
        const innerLeds = new THREE.Points(innerGeometry, innerMaterial);
        innerLeds.renderOrder = 0;
        sphereGroup.add(innerLeds);

        const blackCore = new THREE.Mesh(
            new THREE.IcosahedronGeometry(RADIUS * 0.86, 5),
            new THREE.MeshBasicMaterial({ color: 0x020202 })
        );
        blackCore.renderOrder = -1;
        sphereGroup.add(blackCore);

        const hitSphere = new THREE.Mesh(
            new THREE.IcosahedronGeometry(RADIUS, 3),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        sphereGroup.add(hitSphere);

        // Capetinha 3D: chifres fazem parte do mesmo espaço da Sphere e acompanham sua rotação.
        const devilHorns = new THREE.Group();
        devilHorns.visible = false;
        devilHorns.scale.setScalar(0.001);
        sphereGroup.add(devilHorns);

        const devilHornBaseMat = new THREE.MeshBasicMaterial({
            color: 0x8d163d,
            transparent: true,
            opacity: 0.98,
            depthTest: true,
            depthWrite: true
        });
        const devilHornTipMat = new THREE.MeshBasicMaterial({
            color: 0xe13555,
            transparent: true,
            opacity: 0.98,
            depthTest: true,
            depthWrite: true
        });

        function createDevilHorn(side) {
            const horn = new THREE.Group();

            const base = new THREE.Mesh(
                new THREE.ConeGeometry(0.18, 0.54, 18, 1, false),
                devilHornBaseMat
            );
            base.position.set(0, 0.20, 0);
            base.rotation.z = side * -0.42;
            horn.add(base);

            const tip = new THREE.Mesh(
                new THREE.ConeGeometry(0.115, 0.39, 16, 1, false),
                devilHornTipMat
            );
            tip.position.set(side * 0.13, 0.56, 0);
            tip.rotation.z = side * -0.74;
            horn.add(tip);

            horn.position.set(side * 0.67, RADIUS * 0.74, 0.12);
            horn.rotation.y = side * -0.10;
            horn.rotation.x = -0.08;
            return horn;
        }

        const devilHornLeft = createDevilHorn(-1);
        const devilHornRight = createDevilHorn(1);
        devilHorns.add(devilHornLeft, devilHornRight);

        function updateDevilHorns(now) {
            const isDevilMode = Math.round(uniforms.uExpression.value) === 41;
            const active = isDevilMode && (expressionUntil || expressionReleasing || uniforms.uExprProgress.value > 0.02);

            if (!active) {
                devilHorns.visible = false;
                devilHorns.scale.setScalar(0.001);
                return;
            }

            devilHorns.visible = true;
            const p = THREE.MathUtils.clamp(uniforms.uExprProgress.value, 0, 1);
            const grow = THREE.MathUtils.smoothstep(p, 0.08, 0.44);
            const pulse = 1.0 + Math.sin(now * 0.0042) * 0.018;
            devilHorns.scale.setScalar(Math.max(0.001, grow * pulse));
            devilHorns.position.y = Math.sin(now * 0.0028) * 0.012;
        }

        // Explosão 3D: fica presa ao mesmo espaço da Sphere.
        // Assim acompanha a rotação da cabeça, respeita profundidade e nasce do interior aberto.
        const explosion3D = new THREE.Group();
        explosion3D.visible = false;
        explosion3D.position.set(0, RADIUS * 0.58, 0);
        sphereGroup.add(explosion3D);

        const explosionFlashMat = new THREE.MeshBasicMaterial({
            color: 0xff7a18,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const explosionFlash = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 18, 12),
            explosionFlashMat
        );
        explosionFlash.position.set(0, 0.18, 0);
        explosionFlash.renderOrder = 7;
        explosion3D.add(explosionFlash);

        const rimMat = new THREE.MeshBasicMaterial({
            color: 0xfff7d9,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const fractureRim3D = new THREE.Mesh(
            new THREE.TorusGeometry(0.53, 0.032, 8, 42),
            rimMat
        );
        fractureRim3D.rotation.x = Math.PI / 2;
        fractureRim3D.position.y = 0.11;
        fractureRim3D.renderOrder = 6;
        explosion3D.add(fractureRim3D);

        const stemMat = new THREE.MeshBasicMaterial({
            color: 0xffaf34,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: false
        });
        const explosionStem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.10, 0.16, 0.74, 16, 1, false),
            stemMat
        );
        explosionStem.position.set(0, 0.47, 0);
        explosionStem.scale.set(1, 0.02, 1);
        explosionStem.renderOrder = 5;
        explosion3D.add(explosionStem);

        const puffSpecs = [
            [-0.29, 0.82,  0.00, 0.31, 0xffc861],
            [ 0.00, 0.94,  0.02, 0.38, 0xfff1d7],
            [ 0.30, 0.82, -0.01, 0.31, 0xffb14a],
            [-0.14, 0.93,  0.12, 0.29, 0xffdf91],
            [ 0.16, 0.96, -0.10, 0.30, 0xff9d2d],
            [ 0.00, 0.72,  0.04, 0.27, 0xffe5bc]
        ];
        const explosionPuffs = puffSpecs.map(([x, y, z, size, color]) => {
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0,
                depthTest: true,
                depthWrite: false
            });
            const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
            puff.position.set(x, y, z);
            puff.scale.setScalar(size * 0.15);
            puff.userData.base = new THREE.Vector3(x, y, z);
            puff.userData.size = size;
            puff.renderOrder = 5;
            explosion3D.add(puff);
            return puff;
        });

        const debrisMat = new THREE.MeshBasicMaterial({
            color: 0xffe36c,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: true
        });
        const debrisSpecs = [
            [-0.34, 0.16,  0.08, -0.58, 0.88,  0.20, 0.11],
            [-0.18, 0.21, -0.16, -0.24, 1.05, -0.38, 0.095],
            [ 0.00, 0.24,  0.18,  0.02, 1.18,  0.42, 0.105],
            [ 0.18, 0.21, -0.12,  0.31, 1.02, -0.34, 0.10],
            [ 0.34, 0.15,  0.08,  0.60, 0.88,  0.18, 0.11],
            [-0.08, 0.14,  0.28, -0.12, 0.90,  0.65, 0.085],
            [ 0.10, 0.14,  0.27,  0.16, 0.92,  0.61, 0.085]
        ];
        const fractureDebris = debrisSpecs.map(([x, y, z, dx, dy, dz, size], index) => {
            const piece = new THREE.Mesh(
                new THREE.TetrahedronGeometry(size, 0),
                debrisMat
            );
            piece.position.set(x, y, z);
            piece.userData.base = new THREE.Vector3(x, y, z);
            piece.userData.dir = new THREE.Vector3(dx, dy, dz);
            piece.userData.spin = new THREE.Vector3(
                2.4 + index * 0.31,
                1.8 + index * 0.27,
                2.0 + index * 0.23
            );
            piece.renderOrder = 4;
            explosion3D.add(piece);
            return piece;
        });

        const sparkPalette = [0xff4e1f, 0xff9a1f, 0xffda3b, 0x65d8ff, 0xff5ccf, 0xa8ff5a, 0xffffff, 0xff7f2a];
        const explosionSparks = sparkPalette.map((color, index) => {
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0,
                depthTest: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), material);
            const angle = (index / sparkPalette.length) * Math.PI * 2.0;
            const lift = 0.76 + (index % 3) * 0.08;
            spark.userData.base = new THREE.Vector3(0, 0.16, 0);
            spark.userData.dir = new THREE.Vector3(Math.cos(angle) * 0.62, lift, Math.sin(angle) * 0.62);
            spark.userData.delay = 0.15 + index * 0.018;
            spark.userData.scale = 0.022 + (index % 4) * 0.008;
            spark.renderOrder = 8;
            explosion3D.add(spark);
            return spark;
        });

        function updateExplosion3D(now) {
            const isExplosionMode = Math.round(uniforms.uExpression.value) === 40;
            const active = isExplosionMode && (expressionUntil || expressionReleasing || uniforms.uExprProgress.value > 0.01);

            if (!active || !expressionDuration) {
                explosion3D.visible = false;
                explosionFlashMat.opacity = 0;
                rimMat.opacity = 0;
                stemMat.opacity = 0;
                debrisMat.opacity = 0;
                explosionPuffs.forEach(p => { p.material.opacity = 0; });
                explosionSparks.forEach(s => { s.material.opacity = 0; });
                return;
            }

            explosion3D.visible = true;
            const t = THREE.MathUtils.clamp((now - expressionStart) / Math.max(1, expressionDuration), 0, 1);
            const open = THREE.MathUtils.smoothstep(t, 0.04, 0.20);
            const plume = THREE.MathUtils.smoothstep(t, 0.12, 0.34);
            const fade = 1.0 - THREE.MathUtils.smoothstep(t, 0.72, 1.0);

            fractureRim3D.scale.setScalar(0.74 + open * 0.38);
            rimMat.opacity = open * fade * 0.96;

            const flashPulse = Math.sin(Math.min(1, t / 0.23) * Math.PI);
            explosionFlash.scale.setScalar(0.25 + flashPulse * 1.50);
            explosionFlash.position.y = 0.15 + plume * 0.09;
            explosionFlashMat.opacity = Math.max(0, flashPulse) * (1.0 - THREE.MathUtils.smoothstep(t, 0.24, 0.50));

            explosionStem.scale.set(1.0 + plume * 0.18, Math.max(0.02, plume), 1.0 + plume * 0.18);
            explosionStem.position.y = 0.20 + plume * 0.34;
            stemMat.opacity = plume * fade * 0.92;

            explosionPuffs.forEach((puff, i) => {
                const delay = 0.16 + i * 0.012;
                const puffT = THREE.MathUtils.smoothstep(t, delay, delay + 0.24);
                const size = puff.userData.size * (0.30 + puffT * 0.88);
                puff.scale.setScalar(size);
                puff.position.copy(puff.userData.base);
                puff.position.y += puffT * (0.18 + i * 0.018);
                puff.position.x *= 0.72 + puffT * 1.02;
                puff.material.opacity = puffT * fade * 0.92;
            });

            const eject = THREE.MathUtils.smoothstep(t, 0.05, 0.38);
            const debrisFade = 1.0 - THREE.MathUtils.smoothstep(t, 0.54, 0.92);
            debrisMat.opacity = eject * debrisFade;
            fractureDebris.forEach((piece, i) => {
                piece.position.copy(piece.userData.base);
                piece.position.addScaledVector(piece.userData.dir, eject * 0.78);
                piece.position.y -= Math.max(0, eject - 0.58) * Math.max(0, eject - 0.58) * 0.30;
                piece.rotation.x = piece.userData.spin.x * eject;
                piece.rotation.y = piece.userData.spin.y * eject;
                piece.rotation.z = piece.userData.spin.z * eject;
                const pulseScale = 0.98 + 0.13 * Math.sin((t * 9.0) + i);
                piece.scale.setScalar(pulseScale);
            });

            explosionSparks.forEach((spark, i) => {
                const delay = spark.userData.delay;
                const sparkT = THREE.MathUtils.smoothstep(t, delay, delay + 0.18);
                const sparkFade = 1.0 - THREE.MathUtils.smoothstep(t, delay + 0.18, delay + 0.62);
                const life = sparkT * sparkFade;
                spark.position.copy(spark.userData.base);
                spark.position.addScaledVector(spark.userData.dir, sparkT * 0.88);
                spark.position.y -= Math.max(0, sparkT - 0.64) * Math.max(0, sparkT - 0.64) * 0.12;
                const scale = spark.userData.scale * (1.0 + sparkT * 4.5);
                spark.scale.setScalar(scale);
                spark.material.opacity = life * 0.95;
            });
        }

        const pointer = new THREE.Vector2(0, 0);
        const targetLook = new THREE.Vector2(0, 0);
        const smoothLook = new THREE.Vector2(0, 0);
        const raycaster = new THREE.Raycaster();
        const hitLocal = new THREE.Vector3();
        const drag = {
            active: false,
            pointerId: null,
            startClientX: 0,
            startClientY: 0,
            lastClientX: 0,
            lastClientY: 0,
            startX: 0,
            startY: 0,
            tiltX: 0,
            tiltY: 0
        };

        let pointerActive = false;
        let frameCounter = 0;
        let rafId = 0;
        let running = false;
        let inViewport = true;
        let pageVisible = !document.hidden;
        let lastTime = performance.now();
        let blinkStart = 0;
        let blinkDuration = 160;
        let blinkLagMs = 0;
        let blinkDoublePending = false;
        let secondBlinkAt = 0;
        let nextBlink = performance.now() + 1200 + Math.random() * 2200;
        let expressionStart = 0;
        let expressionDuration = 0;
        let expressionUntil = 0;
        let nextExpression = performance.now() + 3800 + Math.random() * 2600;
        let expressionCooldown = 0;
        let expressionReleasing = false;
        let pendingExpression = null;
        let pendingExpressionAt = 0;
        let lastRandomExpressionMode = -1;
        let randomEmotionBag = [];
        let lastPointerX = 0;
        let lastPointerY = 0;
        let lastPointerTime = performance.now();
        let projectsHover = false;
        let targetPointScale = 1.0;
        let targetGlowScale = 1.34;
        let motionType = 0;
        let motionUntil = 0;
        let motionStart = 0;

        // Etapa 2: Easter eggs e reações do usuário.
        let lastActivityAt = performance.now();
        let idleReactionCooldownUntil = 0;
        let clickBurst = [];
        let clickCooldownUntil = 0;
        let clickResolveTimer = 0;
        let scrollLastY = window.scrollY;
        let scrollLastTime = performance.now();
        let scrollLastDirection = 0;
        let scrollReversals = [];
        let scrollEasterCooldownUntil = 0;
        let slowScrollStartedAt = 0;
        let slowScrollCooldownUntil = 0;
        let scrollLookUntil = 0;
        let scrollLookY = 0;
        let circleLastAngle = null;
        let circleAccum = 0;
        let circleStartedAt = 0;
        let circleCooldownUntil = 0;
        let specialFlipActive = false;
        let specialFlipStart = 0;
        let specialFlipDuration = 1750;
        let faceMiddleHover = false;

        // Etapa 3: evento sazonal do cachecol.
        const SCARF_INTERVAL = 200 * 60 * 1000;
        const SCARF_DURATION = 200 * 60 * 1000;
        const SCARF_CHANCE = 0.38;
        const scarfStorageKey = 'portfolioSphereScarfV1';
        let scarfState = { month: -1, activeUntil: 0, nextEligibleAt: 0, color: '#f4c400' };
        const ACCESSORY_DURATION = 3 * 60 * 1000;
        const ACCESSORY_INTERVAL = 75 * 60 * 1000;
        const ACCESSORY_CHANCE = 0.30;
        const accessoryStorageKey = 'portfolioSphereAccessoryV1';
        let accessoryState = { type: '', activeUntil: 0, nextEligibleAt: 0, month: -1 };
        let stage3LastCheck = 0;
        let spherePointerInside = false;
        let stableHoverSince = 0;
        let stableHoverCooldownUntil = 0;
        let lastStableX = 0;
        let lastStableY = 0;
        let keyEggBuffer = '';
        let keyEggCooldownUntil = 0;

        // Etapa 4: personalidade / gestos de cabeça mais visíveis.
        let headGestureType = 0;
        let headGestureStart = 0;
        let headGestureDuration = 0;
        let nextHeadGestureAt = performance.now() + 5200 + Math.random() * 4200;
        let closedEyesUntil = 0;
        let closedEyesStarted = 0;
        let closedEyesDuration = 0;

        // Etapa 5: reações contextuais + olhos liderando a cabeça + pequenas sequências.
        const headFollowLook = new THREE.Vector2(0, 0);
        let stage5LookOverrideUntil = 0;
        const stage5LookTarget = new THREE.Vector2(0, 0);
        let stage5Sequence = [];
        let stage5SequenceIndex = 0;
        let stage5NextStepAt = 0;
        let pendingSectionReaction = '';
        let sectionReactionCooldownUntil = 0;
        let lastSectionReaction = '';

        const RANDOM_EMOTIONS = [
            { mode: 1, motion: 4, dur: 2700 },
            { mode: 2, motion: 2, dur: 2900 },
            { mode: 3, motion: 3, dur: 2500 },
            { mode: 4, motion: 3, dur: 2500 },
            { mode: 5, motion: 2, dur: 3000 },
            { mode: 6, motion: 1, dur: 2900 },
            { mode: 7, motion: 5, dur: 3200 },
            { mode: 8, motion: 0, dur: 2400 },
            { mode: 9, motion: 6, dur: 3200 },
            { mode: 10, motion: 5, dur: 3100 },
            { mode: 11, motion: 2, dur: 3100 },
            { mode: 12, motion: 0, dur: 2600 },
            { mode: 13, motion: 7, dur: 2900 },
            { mode: 14, motion: 8, dur: 2500 },
            { mode: 15, motion: 7, dur: 3000 },
            { mode: 16, motion: 4, dur: 3000 },
            { mode: 17, motion: 5, dur: 3400 },
            { mode: 18, motion: 3, dur: 3000 },
            { mode: 19, motion: 2, dur: 3600 },
            { mode: 20, motion: 3, dur: 3500 },
            { mode: 21, motion: 7, dur: 3200 },
            { mode: 22, motion: 6, dur: 3400 },
            { mode: 23, motion: 8, dur: 3000 },
            { mode: 24, motion: 5, dur: 3200 },
            { mode: 25, motion: 4, dur: 3100 },
            { mode: 26, motion: 1, dur: 3200 },
            { mode: 27, motion: 4, dur: 3200 },
            { mode: 28, motion: 7, dur: 3200 },
            { mode: 29, motion: 4, dur: 3000 },
            { mode: 30, motion: 1, dur: 3500 },
            { mode: 31, motion: 4, dur: 3300 },
            { mode: 32, motion: 5, dur: 3300 },
            { mode: 33, motion: 6, dur: 3200 },
            { mode: 34, motion: 4, dur: 3200 },
            { mode: 35, motion: 6, dur: 3100 },
            { mode: 36, motion: 7, dur: 2900 },
            { mode: 37, motion: 6, dur: 3500 },
            { mode: 38, motion: 1, dur: 3600 },
            { mode: 39, motion: 4, dur: 3600 },
            { mode: 17, motion: 2, dur: 3600 },
            { mode: 20, motion: 6, dur: 3800 },
            { mode: 22, motion: 4, dur: 3600 },
            { mode: 24, motion: 8, dur: 3400 },
            { mode: 29, motion: 6, dur: 3400 },
            { mode: 30, motion: 4, dur: 3700 },
            { mode: 35, motion: 5, dur: 3300 },
            { mode: 38, motion: 7, dur: 3800 },
            { mode: 39, motion: 6, dur: 3900 }
        ];

        function refillEmotionBag() {
            randomEmotionBag = RANDOM_EMOTIONS.slice();
            for (let i = randomEmotionBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [randomEmotionBag[i], randomEmotionBag[j]] = [randomEmotionBag[j], randomEmotionBag[i]];
            }
            if (randomEmotionBag.length > 1 && randomEmotionBag[0].mode === lastRandomExpressionMode) {
                [randomEmotionBag[0], randomEmotionBag[1]] = [randomEmotionBag[1], randomEmotionBag[0]];
            }
        }

        function nextRandomEmotion() {
            // A explosão (modo 40) deixou de ser aleatória: agora é um easter egg de 10 cliques.
            if (!randomEmotionBag.length) refillEmotionBag();
            const pick = randomEmotionBag.shift();
            lastRandomExpressionMode = pick.mode;
            return pick;
        }

        function mouthTargetForMode(mode) {
            switch (mode) {
                case 1: return 0.78;
                case 6: return 0.22;
                case 8: return 0.28;
                case 9: return 0.92;
                case 12: return 0.48;
                case 14: return 0.14;
                case 19: return 0.0;
                case 22: return 0.90;
                case 23: return 0.62;
                case 25: return 0.16;
                case 31: return 0.96;
                case 33: return 0.34;
                case 35: return 0.32;
                case 37: return 1.0;
                case 39: return 1.0;
                case 40: return 0.86;
                default: return 0.0;
            }
        }


        function updateAngelHalo(now) {
            if (!angelHaloEl) return;
            const isAngelMode = Math.round(uniforms.uExpression.value) === 26;
            const active = isAngelMode && (expressionUntil || expressionReleasing || uniforms.uExprProgress.value > 0.03);
            angelHaloEl.classList.toggle('is-visible', active);
            if (!active) return;

            const progress = THREE.MathUtils.clamp(uniforms.uExprProgress.value, 0, 1);
            const bob = Math.sin(now * 0.0024) * 3.0;
            const scale = 0.90 + progress * 0.16;
            angelHaloEl.style.opacity = String(Math.min(1, 0.25 + progress * 0.9));
            angelHaloEl.style.transform = `translate(-50%, calc(-50% + ${bob.toFixed(2)}px)) scale(${scale.toFixed(3)}) rotateX(62deg)`;
        }

        function beginExpression(mode, duration = 900) {
            const now = performance.now();
            const strongEmotion = [9, 10, 11, 17, 19, 20, 22, 24, 25, 30, 31, 32, 33, 35, 37, 38, 39, 40, 41].includes(mode);
            const minDuration = strongEmotion ? 3200 : 2500;
            const maxDuration = strongEmotion ? 5200 : 4400;
            const naturalDuration = THREE.MathUtils.clamp(duration, minDuration, maxDuration);

            // Cada nova emoção começa de um rosto limpo.
            closedEyesUntil = 0;
            blinkStart = 0;
            secondBlinkAt = 0;
            blinkDoublePending = false;
            uniforms.uBlinkLeft.value = 1;
            uniforms.uBlinkRight.value = 1;
            uniforms.uExpression.value = mode;
            uniforms.uExprProgress.value = 0;
            uniforms.uMouthOpen.value = 0;

            shell.classList.remove('is-exploding');
            shell.classList.toggle('is-exploding', mode === 40);
            expressionStart = now;
            expressionDuration = naturalDuration;
            expressionUntil = now + naturalDuration;
            expressionCooldown = expressionUntil + 1200;
            expressionReleasing = false;
            return true;
        }

        function setExpression(mode, duration = 900) {
            const now = performance.now();
            if (expressionUntil || expressionReleasing) {
                // Só uma emoção fica pendente. Uma nova reação substitui a pendente, nunca a atual.
                pendingExpression = { mode, duration };
                pendingExpressionAt = 0;
                return false;
            }
            pendingExpression = null;
            pendingExpressionAt = 0;
            return beginExpression(mode, duration);
        }

        function setHeadMotion(type = 0, duration = 900) {
            motionType = type;
            motionStart = performance.now();
            motionUntil = motionStart + duration;
        }

        function startHeadGesture(type, duration = 2400) {
            if (drag.active || specialFlipActive) return;
            headGestureType = type;
            headGestureStart = performance.now();
            headGestureDuration = duration;
        }

        function closeBothEyes(duration = 520) {
            const now = performance.now();
            closedEyesStarted = now;
            closedEyesDuration = duration;
            closedEyesUntil = now + duration;
        }

        function updateClosedEyes(now) {
            if (!closedEyesUntil) return;
            if (now >= closedEyesUntil) {
                closedEyesUntil = 0;
                uniforms.uBlinkLeft.value = 1;
                uniforms.uBlinkRight.value = 1;
                return;
            }
            const t = THREE.MathUtils.clamp((now - closedEyesStarted) / Math.max(1, closedEyesDuration), 0, 1);
            // Fecha suavemente, segura um pouco e reabre.
            let v;
            if (t < 0.24) {
                const q = t / 0.24;
                v = 1.0 - q * q;
            } else if (t < 0.72) {
                v = 0.018;
            } else {
                const q = (t - 0.72) / 0.28;
                v = 0.018 + (1.0 - 0.018) * (q * q * (3.0 - 2.0 * q));
            }
            uniforms.uBlinkLeft.value = v;
            uniforms.uBlinkRight.value = v;
        }

        function maybeStartStage4Gesture(now) {
            if (!inViewport || drag.active || specialFlipActive || expressionUntil || expressionReleasing || pendingExpression || stage5Sequence.length || headGestureType || now < nextHeadGestureAt) return;

            const pick = Math.floor(Math.random() * 5);
            if (pick === 0) {
                // Olha para esquerda e direita com a cabeça.
                startHeadGesture(1, 3200);
                setExpression(13, 2100);
            } else if (pick === 1) {
                // Inclinação diagonal + careta.
                startHeadGesture(2, 2800);
                setExpression(Math.random() < 0.5 ? 14 : 15, 2100);
            } else if (pick === 2) {
                // Fecha os olhos e faz um pequeno "hmm".
                startHeadGesture(3, 2400);
                setExpression(6, 1800);
                closeBothEyes(650);
            } else if (pick === 3) {
                // Desconfiada: vira para um lado, volta e olha para o outro.
                startHeadGesture(4, 3000);
                setExpression(5, 2200);
            } else {
                // Careta curta na diagonal.
                startHeadGesture(5, 2600);
                setExpression(Math.random() < 0.45 ? 19 : 11, 1900);
            }

            nextHeadGestureAt = now + 7000 + Math.random() * 6500;
        }


        function startStage5Sequence(steps) {
            if (!Array.isArray(steps) || !steps.length || drag.active || specialFlipActive) return;
            stage5Sequence = steps;
            stage5SequenceIndex = 0;
            stage5NextStepAt = performance.now();
        }

        function applyStage5Step(step, now) {
            if (!step) return;
            if (Array.isArray(step.look)) {
                stage5LookTarget.set(step.look[0], step.look[1]);
                stage5LookOverrideUntil = now + (step.lookFor || step.hold || 900);
            }
            if (typeof step.expr === 'number') setExpression(step.expr, step.exprFor || step.hold || 1200);
            if (typeof step.head === 'number') startHeadGesture(step.head, step.headFor || step.hold || 1600);
            if (step.nod) setHeadMotion(1, step.nodFor || 1200);
            if (step.shake) setHeadMotion(2, step.shakeFor || 1200);
            if (step.closeEyes) closeBothEyes(step.closeEyes);
        }

        function updateStage5Sequence(now) {
            if (!stage5Sequence.length || now < stage5NextStepAt) return;
            if (expressionUntil || expressionReleasing || pendingExpression) return;
            const step = stage5Sequence[stage5SequenceIndex];
            applyStage5Step(step, now);
            stage5SequenceIndex += 1;
            if (stage5SequenceIndex >= stage5Sequence.length) {
                stage5Sequence = [];
                stage5SequenceIndex = 0;
                stage5NextStepAt = 0;
                return;
            }
            stage5NextStepAt = now + (step.hold || 900);
        }

        function triggerSectionReaction(sectionId) {
            const now = performance.now();
            if (!sectionId || now < sectionReactionCooldownUntil) return;
            if (sectionId === lastSectionReaction && now < sectionReactionCooldownUntil + 5000) return;

            lastSectionReaction = sectionId;
            sectionReactionCooldownUntil = now + 5200;

            if (sectionId === 'trajetoria') {
                startStage5Sequence([
                    { look: [-0.48, 0.15], expr: 13, head: 1, hold: 1150 },
                    { look: [0.34, 0.05], expr: 6, nod: true, hold: 1350 }
                ]);
            } else if (sectionId === 'experiencia') {
                startStage5Sequence([
                    { look: [0.0, -0.18], expr: 5, head: 4, hold: 1100 },
                    { look: [0.0, 0.02], expr: 6, nod: true, hold: 1450 }
                ]);
            } else if (sectionId === 'habilidades') {
                startStage5Sequence([
                    { look: [0.40, 0.08], expr: 2, head: 4, hold: 1100 },
                    { look: [-0.28, 0.04], expr: 15, head: 1, hold: 1350 }
                ]);
            } else if (sectionId === 'projetos') {
                startStage5Sequence([
                    { look: [0.0, -0.10], expr: 6, nod: true, hold: 1200 },
                    { look: [0.28, 0.08], expr: 9, head: 2, closeEyes: 430, hold: 1500 }
                ]);
            } else if (sectionId === 'contato') {
                startStage5Sequence([
                    { look: [0.34, 0.10], expr: 18, head: 2, hold: 1250 },
                    { look: [0.0, 0.0], expr: 6, nod: true, hold: 1200 }
                ]);
            }
        }

        function maybeRunPendingSectionReaction() {
            if (!pendingSectionReaction || !inViewport || drag.active || expressionUntil || expressionReleasing || pendingExpression) return;
            const id = pendingSectionReaction;
            pendingSectionReaction = '';
            triggerSectionReaction(id);
        }

        function markActivity() {
            lastActivityAt = performance.now();
        }

        function triggerDizzy(duration = 1450) {
            const now = performance.now();
            if (now < circleCooldownUntil || drag.active) return;
            circleCooldownUntil = now + 11000;
            setExpression(12, duration);
            setHeadMotion(2, Math.min(duration, 1050));
        }

        function triggerScrollNauseaFlip() {
            const now = performance.now();
            if (specialFlipActive || now < scrollEasterCooldownUntil || drag.active) return;
            scrollEasterCooldownUntil = now + 18000;
            specialFlipActive = true;
            specialFlipStart = now;
            setExpression(12, specialFlipDuration);
            setHeadMotion(2, 650);
            targetLook.set(0.0, -0.12);
        }

        function lookTowardElement(el) {
            if (!el || !renderer || !renderer.domElement) return false;
            const targetRect = el.getBoundingClientRect();
            const canvasRect = renderer.domElement.getBoundingClientRect();
            if (!targetRect.width || !targetRect.height || !canvasRect.width || !canvasRect.height) return false;
            const cx = targetRect.left + targetRect.width * 0.5;
            const cy = targetRect.top + targetRect.height * 0.5;
            pointer.x = ((cx - canvasRect.left) / canvasRect.width) * 2 - 1;
            pointer.y = -((cy - canvasRect.top) / canvasRect.height) * 2 + 1;
            pointerActive = true;
            return true;
        }

        function getScarfColorByMonth(monthIndex) {
            const palette = ['#6ec1ff', '#ff5f86', '#54d8b1', '#b78cff', '#5dc06a', '#f08a36', '#5da1ff', '#d97a34', '#f1c40f', '#ff6fae', '#4c8dff', '#d84e4e'];
            return palette[monthIndex] || '#f4c400';
        }

        function saveScarfState() {
            try { localStorage.setItem(scarfStorageKey, JSON.stringify(scarfState)); } catch (e) {}
        }

        function applyScarfColor(color) {
            if (!scarfEl) return;
            scarfEl.style.setProperty('--scarf-color', color);
        }

        function showScarf(animate = false) {
            if (!scarfEl) return;
            scarfEl.classList.remove('is-hiding');
            scarfEl.classList.add('is-visible');
            if (animate) {
                scarfEl.classList.remove('is-flying');
                void scarfEl.offsetWidth;
                scarfEl.classList.add('is-flying');
            }
        }

        function hideScarf(animate = false) {
            if (!scarfEl) return;
            scarfEl.classList.remove('is-flying');
            if (animate) {
                scarfEl.classList.add('is-hiding');
                window.setTimeout(() => {
                    scarfEl.classList.remove('is-hiding');
                    scarfEl.classList.remove('is-visible');
                }, 1150);
            } else {
                scarfEl.classList.remove('is-hiding');
                scarfEl.classList.remove('is-visible');
            }
        }

        function setupScarfState() {
            const now = Date.now();
            const month = new Date().getMonth();
            const color = getScarfColorByMonth(month);
            scarfState = { month, activeUntil: 0, nextEligibleAt: now + SCARF_INTERVAL, color };
            try {
                const raw = localStorage.getItem(scarfStorageKey);
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (saved && typeof saved === 'object') {
                        scarfState.month = typeof saved.month === 'number' ? saved.month : month;
                        scarfState.activeUntil = Number(saved.activeUntil || 0);
                        scarfState.nextEligibleAt = Number(saved.nextEligibleAt || (now + SCARF_INTERVAL));
                        scarfState.color = saved.color || color;
                    }
                }
            } catch (e) {}
            if (scarfState.month !== month) {
                scarfState.month = month;
                scarfState.activeUntil = 0;
                scarfState.nextEligibleAt = now + SCARF_INTERVAL;
                scarfState.color = color;
            }
            scarfState.color = color;
            applyScarfColor(color);
            if (scarfState.activeUntil > now) {
                showScarf(false);
            } else {
                hideScarf(false);
            }
            saveScarfState();
        }

        function maybeTriggerScarfEvent() {
            const now = Date.now();
            if (scarfState.activeUntil > now || now < scarfState.nextEligibleAt) return;
            const activate = Math.random() < SCARF_CHANCE;
            if (activate) {
                scarfState.activeUntil = now + SCARF_DURATION;
                scarfState.nextEligibleAt = scarfState.activeUntil + SCARF_INTERVAL;
                applyScarfColor(scarfState.color);
                showScarf(true);
                setExpression(6, 1300);
                setHeadMotion(1, 900);
            } else {
                scarfState.activeUntil = 0;
                scarfState.nextEligibleAt = now + SCARF_INTERVAL;
            }
            saveScarfState();
        }

        function maintainScarfState() {
            if (!scarfEl) return;
            const now = Date.now();
            if (scarfState.activeUntil > 0 && now > scarfState.activeUntil) {
                scarfState.activeUntil = 0;
                scarfState.nextEligibleAt = now + SCARF_INTERVAL;
                hideScarf(true);
                saveScarfState();
            } else if (scarfState.activeUntil <= 0) {
                maybeTriggerScarfEvent();
            }
        }


        function accessoryTypeForMonth(monthIndex) {
            if (monthIndex === 0 || monthIndex === 1) return 'shades';
            if (monthIndex === 5) return 'straw';
            if (monthIndex === 6 || monthIndex === 7) return 'beanie';
            if (monthIndex === 11) return 'santa';
            return '';
        }

        function saveAccessoryState() {
            try { localStorage.setItem(accessoryStorageKey, JSON.stringify(accessoryState)); } catch (e) {}
        }

        function setAccessoryClass(type) {
            if (!accessoryEl) return;
            accessoryEl.classList.remove('type-shades', 'type-straw', 'type-beanie', 'type-santa');
            if (type) accessoryEl.classList.add('type-' + type);
        }

        function showAccessory(type, animate = false) {
            if (!accessoryEl || !type) return;
            setAccessoryClass(type);
            accessoryEl.classList.remove('is-leaving');
            accessoryEl.classList.add('is-visible');
            if (animate) {
                accessoryEl.classList.remove('is-entering');
                void accessoryEl.offsetWidth;
                accessoryEl.classList.add('is-entering');
            }
        }

        function hideAccessory(animate = false) {
            if (!accessoryEl) return;
            accessoryEl.classList.remove('is-entering');
            if (animate && accessoryEl.classList.contains('is-visible')) {
                accessoryEl.classList.add('is-leaving');
                window.setTimeout(() => {
                    accessoryEl.classList.remove('is-leaving', 'is-visible');
                    setAccessoryClass('');
                }, 1500);
            } else {
                accessoryEl.classList.remove('is-leaving', 'is-visible');
                setAccessoryClass('');
            }
        }

        function setupAccessoryState() {
            const now = Date.now();
            const month = new Date().getMonth();
            const type = accessoryTypeForMonth(month);
            accessoryState = { type, activeUntil: 0, nextEligibleAt: now + ACCESSORY_INTERVAL, month };
            try {
                const raw = localStorage.getItem(accessoryStorageKey);
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (saved && typeof saved === 'object') {
                        accessoryState.type = saved.type || type;
                        accessoryState.activeUntil = Number(saved.activeUntil || 0);
                        accessoryState.nextEligibleAt = Number(saved.nextEligibleAt || (now + ACCESSORY_INTERVAL));
                        accessoryState.month = typeof saved.month === 'number' ? saved.month : month;
                    }
                }
            } catch (e) {}
            if (accessoryState.month !== month || accessoryState.type !== type) {
                accessoryState = { type, activeUntil: 0, nextEligibleAt: now + ACCESSORY_INTERVAL, month };
            }
            if (type && accessoryState.activeUntil > now) showAccessory(type, false);
            else hideAccessory(false);
            saveAccessoryState();
        }

        function maintainAccessoryState() {
            if (!accessoryEl) return;
            const now = Date.now();
            const type = accessoryTypeForMonth(new Date().getMonth());
            if (!type) {
                if (accessoryState.activeUntil) hideAccessory(true);
                accessoryState = { type: '', activeUntil: 0, nextEligibleAt: now + ACCESSORY_INTERVAL, month: new Date().getMonth() };
                saveAccessoryState();
                return;
            }
            if (accessoryState.activeUntil > 0 && now > accessoryState.activeUntil) {
                accessoryState.activeUntil = 0;
                accessoryState.nextEligibleAt = now + ACCESSORY_INTERVAL;
                hideAccessory(true);
                saveAccessoryState();
                return;
            }
            if (accessoryState.activeUntil > now || now < accessoryState.nextEligibleAt) return;
            if (scarfState.activeUntil > now) {
                accessoryState.nextEligibleAt = now + 25 * 60 * 1000;
                saveAccessoryState();
                return;
            }
            if (Math.random() < ACCESSORY_CHANCE) {
                accessoryState.type = type;
                accessoryState.activeUntil = now + ACCESSORY_DURATION;
                accessoryState.nextEligibleAt = accessoryState.activeUntil + ACCESSORY_INTERVAL;
                showAccessory(type, true);
                setExpression(6, 1500);
                setHeadMotion(3, 1250);
            } else {
                accessoryState.nextEligibleAt = now + ACCESSORY_INTERVAL;
            }
            saveAccessoryState();
        }

        setupScarfState();
        setupAccessoryState();

        function resize() {
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            uniforms.uPixelRatio.value = dpr;
        }

        function updatePointer(event) {
            const rect = renderer.domElement.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            pointer.x = THREE.MathUtils.clamp(pointer.x, -1.25, 1.25);
            pointer.y = THREE.MathUtils.clamp(pointer.y, -1.25, 1.25);
            pointerActive = true;

            const now = performance.now();
            markActivity();
            const dt = Math.max(1, now - lastPointerTime);
            const dx = event.clientX - lastPointerX;
            const dy = event.clientY - lastPointerY;
            const speed = Math.hypot(dx, dy) / dt;
            if (speed > 1.55 && now > expressionCooldown && !drag.active) {
                setExpression(1, 650); setHeadMotion(4, 520); // surpresa ao movimento rápido
            }

            // Mouse fazendo círculos ao redor da Sphere -> tontura.
            const cx = rect.left + rect.width * 0.5;
            const cy = rect.top + rect.height * 0.5;
            const vx = event.clientX - cx;
            const vy = event.clientY - cy;
            const distance = Math.hypot(vx, vy);
            if (distance > rect.width * 0.13 && distance < rect.width * 0.47 && now > circleCooldownUntil) {
                const angle = Math.atan2(vy, vx);
                if (circleLastAngle !== null) {
                    let delta = angle - circleLastAngle;
                    while (delta > Math.PI) delta -= Math.PI * 2;
                    while (delta < -Math.PI) delta += Math.PI * 2;
                    if (Math.abs(delta) < 0.75) circleAccum += delta;
                } else {
                    circleStartedAt = now;
                }
                circleLastAngle = angle;
                if (now - circleStartedAt > 2600) {
                    circleStartedAt = now;
                    circleAccum = 0;
                }
                if (Math.abs(circleAccum) > Math.PI * 1.75) {
                    circleAccum = 0;
                    circleLastAngle = null;
                    triggerDizzy(1500);
                }
            } else {
                circleLastAngle = null;
                circleAccum *= 0.85;
            }

            if (spherePointerInside) {
                const stableMove = Math.hypot(event.clientX - lastStableX, event.clientY - lastStableY);
                if (stableMove > 8) {
                    stableHoverSince = now;
                    lastStableX = event.clientX;
                    lastStableY = event.clientY;
                }
            }

            lastPointerX = event.clientX;
            lastPointerY = event.clientY;
            lastPointerTime = now;
        }

        function pointerHitsSphere(event) {
            updatePointer(event);
            raycaster.setFromCamera(pointer, camera);
            return !!raycaster.intersectObject(hitSphere, false)[0];
        }

        shell.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            if (!pointerHitsSphere(event)) return;
            event.preventDefault();
            markActivity();
            drag.active = true;
            drag.pointerId = event.pointerId;
            drag.startClientX = event.clientX;
            drag.startClientY = event.clientY;
            drag.lastClientX = event.clientX;
            drag.lastClientY = event.clientY;
            shell.classList.add('is-dragging');
            try { shell.setPointerCapture(event.pointerId); } catch (_) {}
        });

        function clearCurrentEmotionForClickEgg() {
            pendingExpression = null;
            pendingExpressionAt = 0;
            expressionUntil = 0;
            expressionReleasing = false;
            expressionCooldown = 0;
            uniforms.uExprProgress.value = 0;
            uniforms.uMouthOpen.value = 0;
            uniforms.uExpression.value = 0;
            shell.classList.remove('is-exploding');
        }

        function resolveClickEasterEgg() {
            clickResolveTimer = 0;
            const now = performance.now();
            clickBurst = clickBurst.filter(t => now - t < 4200);
            const totalClicks = clickBurst.length;
            clickBurst = [];

            if (now <= clickCooldownUntil) return;

            if (totalClicks >= 13) {
                clickCooldownUntil = now + 12000;
                clearCurrentEmotionForClickEgg();
                beginExpression(41, 4300);
                setHeadMotion(7, 1800);
                return;
            }

            if (totalClicks >= 8) {
                clickCooldownUntil = now + 12000;
                clearCurrentEmotionForClickEgg();
                beginExpression(40, 4200);
                setHeadMotion(6, 1500);
            }
        }

        shell.addEventListener('click', () => {
            const now = performance.now();
            markActivity();

            // Easter eggs por sequência: esperamos o usuário parar de clicar antes de decidir.
            // 8–12 cliques = explosão; 13+ cliques = capetinha.
            clickBurst = clickBurst.filter(t => now - t < 4200);
            clickBurst.push(now);

            if (clickResolveTimer) clearTimeout(clickResolveTimer);
            clickResolveTimer = window.setTimeout(resolveClickEasterEgg, 700);

            // Um clique isolado ainda pode dar uma reação leve, mas os cliques seguintes
            // não empilham outras emoções enquanto a sequência está sendo contada.
            if (clickBurst.length === 1 && now > expressionCooldown) {
                setExpression(Math.random() < 0.5 ? 3 : 4, 850);
                setHeadMotion(3, 500);
            }
        });

        window.addEventListener('pointermove', event => {
            updatePointer(event);
            if (!drag.active || event.pointerId !== drag.pointerId) return;
            event.preventDefault();
            const deltaX = event.clientX - drag.lastClientX;
            const deltaY = event.clientY - drag.lastClientY;
            drag.lastClientX = event.clientX;
            drag.lastClientY = event.clientY;

            // A esfera fica fixa no centro e apenas gira em 3D.
            drag.tiltY = THREE.MathUtils.clamp(drag.tiltY + deltaX * 0.0038, -0.70, 0.70);
            drag.tiltX = THREE.MathUtils.clamp(drag.tiltX + deltaY * 0.0032, -0.55, 0.55);
        }, { passive: false });

        function endDrag(event) {
            if (!drag.active) return;
            if (event?.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
            drag.active = false;
            shell.classList.remove('is-dragging');
            try { shell.releasePointerCapture(drag.pointerId); } catch (_) {}
            drag.pointerId = null;
        }
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);
        window.addEventListener('pointerleave', () => {
            if (!drag.active) pointerActive = false;
        }, { passive: true });

        window.addEventListener('scroll', () => {
            const now = performance.now();
            const y = window.scrollY;
            const dy = y - scrollLastY;
            const dt = Math.max(1, now - scrollLastTime);
            const absDy = Math.abs(dy);
            const direction = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
            markActivity();

            // Reação imediata: olha para o sentido do scroll por alguns instantes.
            if (direction) {
                scrollLookY = direction > 0 ? -0.82 : 0.82;
                scrollLookUntil = now + 420;
            }

            // Easter egg: scroll rápido alternando cima/baixo várias vezes.
            if (absDy > 26 && dt < 180 && direction && scrollLastDirection && direction !== scrollLastDirection) {
                scrollReversals.push(now);
                scrollReversals = scrollReversals.filter(t => now - t < 2800);
                if (scrollReversals.length >= 6 && inViewport) {
                    scrollReversals = [];
                    triggerScrollNauseaFlip();
                }
            }
            if (direction) scrollLastDirection = direction;

            // Scroll lento contínuo -> começa a ficar sonolenta.
            if (absDy > 0 && absDy < 18 && dt < 260) {
                if (!slowScrollStartedAt) slowScrollStartedAt = now;
                if (now - slowScrollStartedAt > 3200 && now > slowScrollCooldownUntil && inViewport && !drag.active) {
                    slowScrollCooldownUntil = now + 14000;
                    slowScrollStartedAt = 0;
                    setExpression(7, 1600);
                    setHeadMotion(5, 1450);
                }
            } else if (absDy > 24) {
                slowScrollStartedAt = 0;
            }

            scrollLastY = y;
            scrollLastTime = now;
        }, { passive: true });

        shell.addEventListener('pointerenter', event => {
            uniforms.uHover.value = 1;
            spherePointerInside = true;
            stableHoverSince = performance.now();
            lastStableX = event.clientX || 0;
            lastStableY = event.clientY || 0;
        }, { passive: true });
        shell.addEventListener('pointerleave', () => {
            uniforms.uHover.value = drag.active ? 1 : 0;
            spherePointerInside = false;
            stableHoverSince = 0;
            faceMiddleHover = false;
        }, { passive: true });

        if (projectsTrigger) {
            projectsTrigger.addEventListener('mouseenter', () => {
                projectsHover = true;
                uniforms.uHover.value = 1;
                if (performance.now() > expressionCooldown) { setExpression(6, 1200); setHeadMotion(1, 900); }
                lookTowardElement(projectsTrigger);
            }, { passive: true });
            projectsTrigger.addEventListener('mouseleave', () => {
                projectsHover = false;
                if (!drag.active) uniforms.uHover.value = 0;
            }, { passive: true });
        }


        window.addEventListener('keydown', event => {
            const target = event.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            if (event.key.length !== 1) return;
            keyEggBuffer = (keyEggBuffer + event.key.toLowerCase()).slice(-8);
            const now = performance.now();
            if (now < keyEggCooldownUntil) return;
            if (keyEggBuffer.endsWith('oi') || keyEggBuffer.endsWith('hello')) {
                keyEggCooldownUntil = now + 12000;
                keyEggBuffer = '';
                setExpression(6, 1800);
                setHeadMotion(1, 1450);
            }
        });

        function beginBlink(now, fromDouble = false) {
            blinkStart = now;
            const slowBlink = Math.random() < 0.12;
            blinkDuration = slowBlink ? 300 + Math.random() * 140 : 135 + Math.random() * 95;
            blinkLagMs = (Math.random() - 0.5) * 24;
            if (!fromDouble) blinkDoublePending = Math.random() < 0.17;
        }

        function blinkCurve(t) {
            if (t <= 0.0 || t >= 1.0) return 1.0;
            return Math.max(0.045, Math.abs(Math.cos(t * Math.PI)));
        }

        function updateBlink(now) {
            if (closedEyesUntil) {
                updateClosedEyes(now);
                return;
            }
            if (!blinkStart && secondBlinkAt && now >= secondBlinkAt) {
                secondBlinkAt = 0;
                beginBlink(now, true);
            }
            if (!blinkStart && !secondBlinkAt && now >= nextBlink) {
                beginBlink(now, false);
            }
            if (!blinkStart) return;

            const leftT = (now - blinkStart) / blinkDuration;
            const rightT = (now - blinkStart - blinkLagMs) / blinkDuration;
            uniforms.uBlinkLeft.value = blinkCurve(leftT);
            uniforms.uBlinkRight.value = blinkCurve(rightT);

            if (leftT >= 1.0 && rightT >= 1.0) {
                blinkStart = 0;
                uniforms.uBlinkLeft.value = 1;
                uniforms.uBlinkRight.value = 1;
                if (blinkDoublePending) {
                    blinkDoublePending = false;
                    secondBlinkAt = now + 90 + Math.random() * 100;
                } else {
                    nextBlink = now + 1250 + Math.random() * 2800;
                }
            }
        }

        function updateExpression(now) {
            if (expressionUntil && now >= expressionUntil) {
                expressionUntil = 0;
                expressionReleasing = true;
            }

            // Sem interação por um tempo -> sono/bocejo discreto.
            if (inViewport && !drag.active && !expressionUntil && !expressionReleasing && now - lastActivityAt > 11500 && now > idleReactionCooldownUntil) {
                idleReactionCooldownUntil = now + 22000;
                lastActivityAt = now;
                setExpression(7, 1850);
                setHeadMotion(5, 1650);
            }
            if (motionUntil && now >= motionUntil) {
                motionType = 0;
                motionUntil = 0;
            }
            if (!expressionUntil && !expressionReleasing && !pendingExpression && !stage5Sequence.length && now >= nextExpression && !drag.active) {
                const pick = nextRandomEmotion();
                setExpression(pick.mode, pick.dur + Math.random() * 350);
                if (pick.motion) {
                    const fastMotion = [9, 10, 11, 19, 22, 30, 31, 35, 37, 39, 40].includes(pick.mode);
                    setHeadMotion(pick.motion, fastMotion ? 950 + Math.random() * 280 : 1400 + Math.random() * 480);
                }
                nextExpression = now + 3200 + Math.random() * 2400;
            }
        }

        function animate(now) {
            if (!running) return;
            rafId = requestAnimationFrame(animate);
            const dt = Math.min(0.05, (now - lastTime) / 1000);
            lastTime = now;
            uniforms.uTime.value += dt;
            updateBlink(now);
            updateExpression(now);
            maybeStartStage4Gesture(now);
            updateStage5Sequence(now);
            maybeRunPendingSectionReaction();

            if (now - stage3LastCheck > 5000) {
                stage3LastCheck = now;
                maintainScarfState();
                maintainAccessoryState();
            }

            // Hover parado na esfera não dispara mais emoções.

            if (expressionUntil && expressionDuration > 0) {
                const ep = THREE.MathUtils.clamp((now - expressionStart) / expressionDuration, 0, 1);
                const enterT = THREE.MathUtils.clamp(ep / 0.12, 0, 1);
                const easedEnter = enterT * enterT * (3 - 2 * enterT);
                uniforms.uExprProgress.value += (easedEnter - uniforms.uExprProgress.value) * 0.18;
                let mouthEnvelope = 1.0;
                if (ep < 0.12) mouthEnvelope = ep / 0.12;
                else if (ep > 0.88) mouthEnvelope = (1.0 - ep) / 0.12;
                mouthEnvelope = THREE.MathUtils.clamp(mouthEnvelope, 0, 1);
                mouthEnvelope = mouthEnvelope * mouthEnvelope * (3.0 - 2.0 * mouthEnvelope);
                const mouthTarget = mouthTargetForMode(Math.round(uniforms.uExpression.value)) * mouthEnvelope;
                uniforms.uMouthOpen.value += (mouthTarget - uniforms.uMouthOpen.value) * 0.20;
            } else {
                uniforms.uExprProgress.value += (0 - uniforms.uExprProgress.value) * (expressionReleasing ? 0.065 : 0.12);
                uniforms.uMouthOpen.value += (0 - uniforms.uMouthOpen.value) * 0.10;
                if (expressionReleasing && uniforms.uExprProgress.value < 0.03 && uniforms.uMouthOpen.value < 0.025) {
                    uniforms.uExpression.value = 0;
                    uniforms.uExprProgress.value = 0;
                    uniforms.uMouthOpen.value = 0;
                    expressionDuration = 0;
                    expressionReleasing = false;
                    shell.classList.remove('is-exploding');
                    if (pendingExpression && !pendingExpressionAt) pendingExpressionAt = now + 220;
                }
            }

            if (!expressionUntil && !expressionReleasing && pendingExpression && pendingExpressionAt && now >= pendingExpressionAt) {
                const queued = pendingExpression;
                pendingExpression = null;
                pendingExpressionAt = 0;
                beginExpression(queued.mode, queued.duration);
                nextExpression = now + 3800 + Math.random() * 2400;
            }

            targetPointScale = projectsHover ? 1.12 : 1.0;
            targetGlowScale = projectsHover ? 1.40 : 1.24;
            uniforms.uPointScale.value += (targetPointScale - uniforms.uPointScale.value) * 0.08;
            glowUniforms.uPointScale.value += (targetGlowScale - glowUniforms.uPointScale.value) * 0.08;

            if (projectsHover) {
                lookTowardElement(projectsTrigger);
            }

            frameCounter = (frameCounter + 1) % 3;
            if (!projectsHover) {
                faceMiddleHover = false;
                const idleX = Math.sin(now * 0.00072) * 0.09 + Math.sin(now * 0.00131) * 0.025;
                const idleY = Math.cos(now * 0.00063) * 0.055;
                targetLook.set(idleX, idleY);
            }

            if (now < scrollLookUntil && !projectsHover && !drag.active) {
                targetLook.y = scrollLookY;
            }

            if (now < stage5LookOverrideUntil && !drag.active) {
                targetLook.lerp(stage5LookTarget, 0.30);
            }

            // Os olhos chegam primeiro; a cabeça acompanha com atraso leve.
            smoothLook.x += (targetLook.x - smoothLook.x) * 0.135;
            smoothLook.y += (targetLook.y - smoothLook.y) * 0.135;
            uniforms.uLook.value.set(smoothLook.x, smoothLook.y);
            headFollowLook.x += (smoothLook.x - headFollowLook.x) * 0.038;
            headFollowLook.y += (smoothLook.y - headFollowLook.y) * 0.038;

            // A esfera mantém vida própria e reações dos botões; o seguir do mouse foi removido.
            const ambientYaw = Math.sin(now * 0.00052) * 0.032;
            const ambientPitch = Math.cos(now * 0.00044) * 0.016;
            const idleTargetY = headFollowLook.x * 0.072 + ambientYaw;
            const idleTargetX = -headFollowLook.y * 0.052 + ambientPitch;
            let motionRotY = 0;
            let motionRotX = 0;
            let motionRotZ = 0;
            if (motionType && motionUntil) {
                const t = THREE.MathUtils.clamp((now - motionStart) / Math.max(1, (motionUntil - motionStart)), 0, 1);
                const decay = Math.sin(t * Math.PI);
                if (motionType === 1) { // concorda
                    motionRotX = Math.sin(t * Math.PI * 4.0) * 0.13 * decay;
                } else if (motionType === 2) { // nega
                    motionRotY = Math.sin(t * Math.PI * 5.0) * 0.16 * decay;
                } else if (motionType === 3) { // inclina curioso/fofo
                    motionRotY = Math.sin(t * Math.PI) * 0.13;
                    motionRotX = -Math.sin(t * Math.PI) * 0.045;
                    motionRotZ = Math.sin(t * Math.PI) * 0.05;
                } else if (motionType === 4) { // susto: recua e volta
                    motionRotX = -Math.sin(t * Math.PI) * 0.18;
                } else if (motionType === 5) { // sono/triste: cai e recupera
                    motionRotX = Math.sin(t * Math.PI) * 0.14;
                    motionRotY = Math.sin(t * Math.PI) * 0.035;
                } else if (motionType === 6) { // risada
                    motionRotX = Math.sin(t * Math.PI * 5.0) * 0.075 * decay;
                    motionRotY = Math.sin(t * Math.PI * 3.0) * 0.045 * decay;
                    motionRotZ = Math.sin(t * Math.PI * 4.0) * 0.04 * decay;
                } else if (motionType === 7) { // rotação de cabeça para esquerda e direita
                    motionRotY = Math.sin(t * Math.PI * 2.0) * 0.34 * decay;
                    motionRotX = Math.sin(t * Math.PI) * 0.055;
                    motionRotZ = Math.sin(t * Math.PI * 2.0) * 0.035 * decay;
                } else if (motionType === 8) { // rotação diagonal com careta
                    motionRotY = Math.sin(t * Math.PI * 2.0) * 0.22 * decay;
                    motionRotX = -Math.sin(t * Math.PI) * 0.13;
                    motionRotZ = Math.sin(t * Math.PI) * 0.15;
                }
            }
            // Gestos de cabeça da Etapa 4. Não são giros completos: são rotações de "cabeça".
            let gestureRotX = 0;
            let gestureRotY = 0;
            let gestureRotZ = 0;
            if (headGestureType && headGestureDuration > 0) {
                const gt = THREE.MathUtils.clamp((now - headGestureStart) / headGestureDuration, 0, 1);
                const envelope = Math.sin(gt * Math.PI);

                if (headGestureType === 1) {
                    // esquerda -> direita -> centro
                    gestureRotY = Math.sin(gt * Math.PI * 2.0) * 0.36 * envelope;
                    gestureRotZ = Math.sin(gt * Math.PI * 2.0) * 0.035 * envelope;
                } else if (headGestureType === 2) {
                    // diagonal brincalhona
                    gestureRotY = Math.sin(gt * Math.PI) * 0.22;
                    gestureRotX = -Math.sin(gt * Math.PI) * 0.10;
                    gestureRotZ = Math.sin(gt * Math.PI) * 0.16;
                } else if (headGestureType === 3) {
                    // fecha os olhos e inclina levemente
                    gestureRotX = Math.sin(gt * Math.PI) * 0.085;
                    gestureRotZ = -Math.sin(gt * Math.PI) * 0.075;
                } else if (headGestureType === 4) {
                    // desconfiada: dois lados com pausa visual no meio
                    gestureRotY = Math.sin(gt * Math.PI * 3.0) * 0.25 * envelope;
                    gestureRotX = -Math.sin(gt * Math.PI) * 0.045;
                } else if (headGestureType === 5) {
                    // careta diagonal mais marcada
                    gestureRotY = -Math.sin(gt * Math.PI) * 0.19;
                    gestureRotX = Math.sin(gt * Math.PI) * 0.085;
                    gestureRotZ = -Math.sin(gt * Math.PI) * 0.18;
                }

                if (gt >= 1.0) {
                    headGestureType = 0;
                    headGestureDuration = 0;
                }
            }

            const targetRotY = (drag.active ? drag.tiltY : idleTargetY) + motionRotY + gestureRotY;
            const targetRotX = (drag.active ? drag.tiltX : idleTargetX) + motionRotX + gestureRotX;
            const targetRotZ = motionRotZ + gestureRotZ;
            const fastHeadNow = motionType === 1 || motionType === 2 || motionType === 4 || motionType === 6 || motionType === 8;
            sphereGroup.rotation.y += (targetRotY - sphereGroup.rotation.y) * (drag.active ? 0.20 : (fastHeadNow ? 0.18 : 0.095));

            if (specialFlipActive) {
                const ft = THREE.MathUtils.clamp((now - specialFlipStart) / specialFlipDuration, 0, 1);
                let spinT = 0;
                let nauseaWobble = 0;
                if (ft < 0.24) {
                    const nt = ft / 0.24;
                    nauseaWobble = Math.sin(nt * Math.PI * 5.0) * 0.14 * (1.0 - nt * 0.35);
                } else {
                    const raw = THREE.MathUtils.clamp((ft - 0.24) / 0.64, 0, 1);
                    spinT = raw < 0.5 ? 2.0 * raw * raw : 1.0 - Math.pow(-2.0 * raw + 2.0, 2.0) / 2.0;
                }
                sphereGroup.rotation.y += nauseaWobble;
                sphereGroup.rotation.x = targetRotX + spinT * Math.PI * 2.0;
                if (ft >= 1.0) {
                    specialFlipActive = false;
                    sphereGroup.rotation.x = targetRotX;
                }
            } else {
                sphereGroup.rotation.x += (targetRotX - sphereGroup.rotation.x) * (drag.active ? 0.24 : (fastHeadNow ? 0.19 : 0.13));
            }
            sphereGroup.rotation.z += (targetRotZ - sphereGroup.rotation.z) * (drag.active ? 0.16 : (fastHeadNow ? 0.14 : 0.085));

            if (!drag.active) {
                drag.tiltX *= 0.88;
                drag.tiltY *= 0.88;
            }

            updateExplosion3D(now);
            updateDevilHorns(now);
            updateAngelHalo(now);
            renderer.render(scene, camera);
        }

        function startLoop() {
            if (running || !inViewport || !pageVisible) return;
            running = true;
            lastTime = performance.now();
            rafId = requestAnimationFrame(animate);
        }
        function stopLoop() {
            if (!running) return;
            running = false;
            cancelAnimationFrame(rafId);
            rafId = 0;
        }


        if (stage5Sections.length) {
            const sectionObserver = new IntersectionObserver(entries => {
                const visible = entries
                    .filter(entry => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (!visible || !visible.target?.id) return;
                const id = visible.target.id;
                if (inViewport && pageVisible) triggerSectionReaction(id);
                else pendingSectionReaction = id;
            }, { threshold: [0.24, 0.42, 0.62] });
            stage5Sections.forEach(section => sectionObserver.observe(section));
        }

        const observer = new IntersectionObserver(([entry]) => {
            inViewport = !!entry && entry.isIntersecting;
            if (inViewport && pageVisible) startLoop();
            else stopLoop();
        }, { threshold: 0.08 });
        observer.observe(shell);

        document.addEventListener('visibilitychange', () => {
            pageVisible = !document.hidden;
            if (pageVisible && inViewport) startLoop();
            else stopLoop();
        });
        window.addEventListener('resize', resize, { passive: true });

        resize();
        shell.classList.add('is-webgl-ready');
        startLoop();
    }
})();
