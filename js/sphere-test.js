(() => {
    const host = document.getElementById('sphere-test-canvas');
    const shell = document.getElementById('sphere-test-shell');
    if (!host || !shell) return;

    const depsReady = window.THREE && THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass;
    if (!depsReady) {
        shell.classList.add('is-fallback-only');
        return;
    }

    const THREE = window.THREE;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 60);
    camera.position.set(0, 0, 6.15);

    const renderer = new THREE.WebGLRenderer({
        antialias: false, // os próprios LEDs já são suavizados no shader
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // Pós-processamento: bloom único e leve.
    const renderPass = new THREE.RenderPass(scene, camera);
    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.28, 0.48);
    bloomPass.strength = 0.72;
    bloomPass.radius = 0.28;
    bloomPass.threshold = 0.48;
    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    const RADIUS = 1.72;
    const LED_COUNT = 18000;
    const sphereGroup = new THREE.Group();
    scene.add(sphereGroup);

    // Distribuição de Fibonacci: pontos uniformes, sem costuras/polos concentrados.
    const positions = new Float32Array(LED_COUNT * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < LED_COUNT; i++) {
        const y = 1 - (i / (LED_COUNT - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        positions[i * 3] = x * RADIUS;
        positions[i * 3 + 1] = y * RADIUS;
        positions[i * 3 + 2] = z * RADIUS;
    }
    const ledGeometry = new THREE.BufferGeometry();
    ledGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const uniforms = {
        uTime: { value: 0 },
        uLook: { value: new THREE.Vector2(0, 0) },
        uBlink: { value: 1 },
        uHover: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
    };

    const vertexShader = `
        uniform float uPixelRatio;
        varying vec3 vObjPos;
        varying float vDepthLight;

        void main() {
            vObjPos = position / ${RADIUS.toFixed(2)};
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float depth = max(2.0, -mv.z);
            gl_PointSize = (4.15 * uPixelRatio) * (6.1 / depth);
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
        uniform float uBlink;
        uniform float uHover;
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

        void main() {
            // LED circular individual.
            vec2 pc = gl_PointCoord - 0.5;
            float d = length(pc);
            if (d > 0.5) discard;
            float dotAlpha = 1.0 - smoothstep(0.36, 0.50, d);
            float core = 1.0 - smoothstep(0.0, 0.31, d);

            vec3 yellow = vec3(1.0, 0.72, 0.015);
            vec3 warmYellow = vec3(1.0, 0.84, 0.055);
            vec3 color = mix(yellow, warmYellow, core * 0.38) * vDepthLight;

            vec2 p = vObjPos.xy;
            float front = smoothstep(0.18, 0.42, vObjPos.z);
            vec2 look = clamp(uLook, vec2(-1.0), vec2(1.0));

            // Expressão calma e simples, toda calculada nos LEDs.
            vec2 eyeR = vec2(0.155, 0.205 * max(uBlink, 0.055));
            vec2 leftC  = vec2(-0.285, 0.19);
            vec2 rightC = vec2( 0.285, 0.19);
            float leftEye = fillEllipse(p, leftC, eyeR, 0.035) * front;
            float rightEye = fillEllipse(p, rightC, eyeR, 0.035) * front;
            float eyes = max(leftEye, rightEye);

            vec2 pupilOffset = vec2(look.x * 0.050, look.y * 0.038);
            vec2 pupilR = vec2(0.055, 0.064 * max(uBlink, 0.20));
            float lp = fillEllipse(p, leftC + pupilOffset, pupilR, 0.045) * leftEye;
            float rp = fillEllipse(p, rightC + pupilOffset, pupilR, 0.045) * rightEye;
            float pupils = max(lp, rp);

            float mouthHalf = mix(0.125, 0.165, uHover);
            float mouthCurve = -0.36 - 0.080 * (1.0 - (p.x / mouthHalf) * (p.x / mouthHalf));
            float mouthRange = 1.0 - smoothstep(mouthHalf, mouthHalf + 0.018, abs(p.x));
            float mouth = lineMask(p.y - mouthCurve, 0.013, 0.010) * mouthRange * front;

            vec3 eyeWhite = vec3(1.15, 1.15, 1.12); // >1 ajuda o bloom seletivo
            vec3 ink = vec3(0.025, 0.025, 0.024);
            color = mix(color, eyeWhite, eyes);
            color = mix(color, ink, pupils);
            color = mix(color, ink, mouth);

            // Pulso discreto de painel LED.
            float pulse = 0.018 * sin(uTime * 1.15 + vObjPos.y * 2.2);
            color += yellow * pulse;

            gl_FragColor = vec4(color, dotAlpha);
        }
    `;

    const ledMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending
    });

    const leds = new THREE.Points(ledGeometry, ledMaterial);
    leds.renderOrder = 3;
    sphereGroup.add(leds);

    // Esfera interna menor com LEDs pretos, mantendo a superfície externa idêntica à V6.
    const INNER_RADIUS = RADIUS * 0.78;
    const INNER_LED_COUNT = 5200;
    const innerPositions = new Float32Array(INNER_LED_COUNT * 3);
    for (let i = 0; i < INNER_LED_COUNT; i++) {
        const y = 1 - (i / (INNER_LED_COUNT - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        innerPositions[i * 3] = Math.cos(theta) * r * INNER_RADIUS;
        innerPositions[i * 3 + 1] = y * INNER_RADIUS;
        innerPositions[i * 3 + 2] = Math.sin(theta) * r * INNER_RADIUS;
    }
    const innerLedGeometry = new THREE.BufferGeometry();
    innerLedGeometry.setAttribute('position', new THREE.BufferAttribute(innerPositions, 3));

    const innerVertexShader = `
        uniform float uPixelRatio;
        varying float vShade;
        void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float depth = max(2.0, -mv.z);
            gl_PointSize = (2.0 * uPixelRatio) * (6.1 / depth);
            gl_Position = projectionMatrix * mv;
            vec3 n = normalize(position);
            vec3 lightDir = normalize(vec3(-0.46, 0.68, 0.62));
            vShade = 0.025 + max(dot(n, lightDir), 0.0) * 0.045;
        }
    `;

    const innerFragmentShader = `
        precision highp float;
        varying float vShade;
        void main() {
            vec2 pc = gl_PointCoord - 0.5;
            float d = length(pc);
            if (d > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.34, 0.50, d);
            gl_FragColor = vec4(vec3(vShade), alpha * 0.34);
        }
    `;

    const innerLedMaterial = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: uniforms.uPixelRatio },
        vertexShader: innerVertexShader,
        fragmentShader: innerFragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        blending: THREE.NormalBlending
    });
    const innerLeds = new THREE.Points(innerLedGeometry, innerLedMaterial);
    innerLeds.renderOrder = 2;
    sphereGroup.add(innerLeds);

    const inner = new THREE.Mesh(
        new THREE.IcosahedronGeometry(RADIUS * 0.70, 4),
        new THREE.MeshBasicMaterial({ color: 0x030303, transparent: false })
    );
    inner.renderOrder = 1;
    sphereGroup.add(inner);

    // Raycaster usa uma malha invisível simples, não 18 mil pontos.
    const hitSphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(RADIUS, 3),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    sphereGroup.add(hitSphere);

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
        startX: 0,
        startY: 0
    };
    let pointerActive = false;
    let frameCounter = 0;
    let rafId = 0;
    let running = false;
    let inViewport = true;
    let pageVisible = !document.hidden;
    let lastTime = performance.now();
    let blinkStart = 0;
    let blinkDuration = 170;
    let nextBlink = performance.now() + 1900 + Math.random() * 2800;

    function viewportWorldSize() {
        const rect = renderer.domElement.getBoundingClientRect();
        const distance = camera.position.z - sphereGroup.position.z;
        const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
        return { rect, h: visibleH, w: visibleH * camera.aspect };
    }

    function clampSpherePosition() {
        const size = viewportWorldSize();
        const pad = RADIUS * 1.04;
        const maxX = Math.max(0, size.w * 0.5 - pad);
        const maxY = Math.max(0, size.h * 0.5 - pad);
        sphereGroup.position.x = THREE.MathUtils.clamp(sphereGroup.position.x, -maxX, maxX);
        sphereGroup.position.y = THREE.MathUtils.clamp(sphereGroup.position.y, -maxY, maxY);
    }

    function resize() {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        renderer.setSize(width, height, false);
        composer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
        clampSpherePosition();
    }

    function updatePointer(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        pointer.x = THREE.MathUtils.clamp(pointer.x, -1.25, 1.25);
        pointer.y = THREE.MathUtils.clamp(pointer.y, -1.25, 1.25);
        pointerActive = true;
    }
    function pointerHitsSphere(event) {
        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);
        return !!raycaster.intersectObject(hitSphere, false)[0];
    }

    shell.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (!pointerHitsSphere(event)) return;
        event.preventDefault();
        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.startClientX = event.clientX;
        drag.startClientY = event.clientY;
        drag.startX = sphereGroup.position.x;
        drag.startY = sphereGroup.position.y;
        shell.classList.add('is-dragging');
        try { shell.setPointerCapture(event.pointerId); } catch (_) {}
    });

    window.addEventListener('pointermove', (event) => {
        updatePointer(event);
        if (!drag.active || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        const size = viewportWorldSize();
        const worldPerPixelX = size.w / Math.max(1, size.rect.width);
        const worldPerPixelY = size.h / Math.max(1, size.rect.height);
        sphereGroup.position.x = drag.startX + (event.clientX - drag.startClientX) * worldPerPixelX;
        sphereGroup.position.y = drag.startY - (event.clientY - drag.startClientY) * worldPerPixelY;
        clampSpherePosition();
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
    window.addEventListener('pointerleave', () => { if (!drag.active) pointerActive = false; }, { passive:true });
    shell.addEventListener('pointerenter', () => { uniforms.uHover.value = 1; }, { passive:true });
    shell.addEventListener('pointerleave', () => { uniforms.uHover.value = drag.active ? 1 : 0; }, { passive:true });

    function updateBlink(now) {
        if (!blinkStart && now >= nextBlink) {
            blinkStart = now;
            blinkDuration = 145 + Math.random() * 75;
        }
        if (!blinkStart) return;
        const t = (now - blinkStart) / blinkDuration;
        if (t >= 1) {
            blinkStart = 0;
            uniforms.uBlink.value = 1;
            nextBlink = now + 1900 + Math.random() * 3900;
        } else {
            uniforms.uBlink.value = Math.max(0.05, Math.abs(Math.cos(t * Math.PI)));
        }
    }

    function animate(now) {
        if (!running) return;
        rafId = requestAnimationFrame(animate);
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        uniforms.uTime.value += dt;
        updateBlink(now);

        // Raycast só a cada terceiro frame e apenas numa esfera invisível leve.
        frameCounter = (frameCounter + 1) % 3;
        if (frameCounter === 0 && pointerActive && !drag.active) {
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.intersectObject(hitSphere, false)[0];
            if (hit) {
                hitLocal.copy(hit.point);
                hitSphere.worldToLocal(hitLocal).divideScalar(RADIUS);
                targetLook.set(hitLocal.x * 1.65, hitLocal.y * 1.65);
            } else {
                targetLook.set(pointer.x * 0.72, pointer.y * 0.56);
            }
            targetLook.x = THREE.MathUtils.clamp(targetLook.x, -1, 1);
            targetLook.y = THREE.MathUtils.clamp(targetLook.y, -1, 1);
        } else if (!pointerActive) {
            targetLook.set(0, 0);
        }

        smoothLook.x += (targetLook.x - smoothLook.x) * 0.075;
        smoothLook.y += (targetLook.y - smoothLook.y) * 0.075;
        uniforms.uLook.value.set(smoothLook.x, smoothLook.y);

        // Micro rotação mantém a sensação 3D sem tirar a face da frente.
        if (!drag.active) {
            const ry = smoothLook.x * 0.025;
            const rx = -smoothLook.y * 0.018;
            sphereGroup.rotation.y += (ry - sphereGroup.rotation.y) * 0.05;
            sphereGroup.rotation.x += (rx - sphereGroup.rotation.x) * 0.05;
        }

        composer.render();
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

    const observer = new IntersectionObserver(([entry]) => {
        inViewport = !!entry && entry.isIntersecting;
        if (inViewport && pageVisible) startLoop();
        else stopLoop();
    }, { threshold:0.08 });
    observer.observe(shell);

    document.addEventListener('visibilitychange', () => {
        pageVisible = !document.hidden;
        if (pageVisible && inViewport) startLoop();
        else stopLoop();
    });
    window.addEventListener('resize', resize, { passive:true });

    resize();
    shell.classList.add('is-webgl-ready');
    startLoop();
})();
