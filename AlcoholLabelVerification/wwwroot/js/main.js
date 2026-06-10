async function uploadImage() {
    console.log('uploadImage called');
    try {
        const fileInputEl = document.getElementById('fileInput');

        if (!fileInputEl) {
            console.error('fileInput element not found');
            alert('File input element not found');
            return;
        }
        const file = fileInputEl.files && fileInputEl.files[0];

        if (!file) {
            alert("Please select an image file.");
            return;
        }
    const loadingEl = document.getElementById('loading');
    const fileNameEl = document.getElementById('fileName');
    const resultsDiv = document.getElementById('results');
    const uploadBtn = document.getElementById('uploadBtn');
    if (fileNameEl) fileNameEl.textContent = file.name;

    const formData = new FormData();
    formData.append('image', file);

    if (loadingEl) loadingEl.style.display = 'block';
    if (resultsDiv) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="padding:12px">Uploading and analyzing image... <span style="color:#666">(this may take a few seconds)</span></div>';
    }
    if (uploadBtn) uploadBtn.disabled = true;

    try {
        console.log('sending fetch to /api/AlcoholVerification/verify');
        const resp = await fetch('/api/AlcoholVerification/verify', { method: 'POST', body: formData });
        console.log('fetch response', resp.status, resp.ok);
        if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            const statusText = `Server error: ${resp.status}${text ? ' - ' + text : ''}`;
            console.error(statusText);
            if (resultsDiv) resultsDiv.innerHTML = `<div style="color:#721c24;padding:12px">${statusText}</div>`;
            return;
        }
        const json = await resp.json().catch(e => null);
        console.log('response json', json);
        if (resultsDiv) {
            if (!json) {
                resultsDiv.innerHTML = '<div style="padding:12px">No JSON returned from server.</div>';
                return;
            }
        }
        if (json) showResults(json);
    } catch (err) {
        console.error('Error during fetch/upload:', err);
        if (resultsDiv) {
            const msg = err && err.message ? err.message : String(err);
            resultsDiv.innerHTML = `<div style="color:#721c24;padding:12px">Error: ${msg}</div>`;
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (uploadBtn) uploadBtn.disabled = false;
    }
    }
    catch (e) {
        console.error('uploadImage error', e);
        alert('Unexpected error in uploadImage: ' + (e && e.message ? e.message : String(e)));
    }
}

/**
 * Render results returned from the server
 * @param {any} data
 */
function showResults(data) {
    try {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '';

        const statusText = String((data && (data.Status ?? data.status)) || 'Unknown');
        const isPass = statusText.toLowerCase() === 'pass';
        const message = (data && (data.Message ?? data.message)) || '';
        const extractedText = (data && (data.ExtractedText ?? data.extractedText)) || 'No text found';

        const card = document.createElement('div');
        card.className = 'results-card';

        const header = document.createElement('div');
        header.className = 'results-header';

        const title = document.createElement('div');
        title.innerHTML = '<strong>Label Verification</strong>';
        header.appendChild(title);

        const statusBadge = document.createElement('div');
        statusBadge.className = isPass ? 'status-pass' : 'status-fail';
        statusBadge.textContent = isPass ? 'PASS' : 'FAIL';
        header.appendChild(statusBadge);

        card.appendChild(header);

        if (message) {
            const pMsg = document.createElement('p');
            pMsg.style.marginTop = '10px';
            pMsg.innerHTML = '<strong>Message:</strong> ' + message;
            card.appendChild(pMsg);
        }

        // show preview of uploaded image if available
        try {
            const fileInputEl = document.getElementById('fileInput');
            if (fileInputEl && fileInputEl.files && fileInputEl.files[0]) {
                const file = fileInputEl.files[0];
                const img = document.createElement('img');
                img.style.maxWidth = '180px';
                img.style.maxHeight = '180px';
                img.style.marginTop = '8px';
                img.style.borderRadius = '6px';
                const reader = new FileReader();
                reader.onload = function (e) {
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
                card.appendChild(img);
            }
        } catch (e) {
            // ignore preview errors
        }

        // Extracted text
        const preWrap = document.createElement('pre');
        preWrap.textContent = extractedText;
        preWrap.style.whiteSpace = 'pre-wrap';
        preWrap.style.background = '#f7f7f7';
        preWrap.style.padding = '8px';
        preWrap.style.borderRadius = '3px';
        preWrap.style.marginTop = '12px';
        card.appendChild(preWrap);

        // Keywords triggered (if present) - server returns object with categories
        const kwObj = data && (data.KeywordsTriggered || data.keywordsTriggered || data.keywords);
        if (kwObj) {
            const kwHeader = document.createElement('p');
            const strongKw = document.createElement('strong');
            strongKw.textContent = 'Keywords triggered:';
            kwHeader.appendChild(strongKw);
            resultsDiv.appendChild(kwHeader);

            if (kwObj.All || kwObj.all) {
                const all = kwObj.All || kwObj.all;
                if (Array.isArray(all) && all.length > 0) {
                    const kwPre = document.createElement('pre');
                    kwPre.textContent = all.join('\n');
                    kwPre.style.whiteSpace = 'pre-wrap';
                    kwPre.style.background = '#f7f7f7';
                    kwPre.style.padding = '8px';
                    kwPre.style.borderRadius = '3px';
                    resultsDiv.appendChild(kwPre);
                }
            }
            else if (Array.isArray(kwObj) && kwObj.length > 0) {
                const kwPre = document.createElement('pre');
                kwPre.textContent = kwObj.join('\n');
                kwPre.style.whiteSpace = 'pre-wrap';
                kwPre.style.background = '#f7f7f7';
                kwPre.style.padding = '8px';
                kwPre.style.borderRadius = '3px';
                resultsDiv.appendChild(kwPre);
            }
            else {
                Object.keys(kwObj).forEach(cat => {
                    const arr = kwObj[cat];
                    if (Array.isArray(arr) && arr.length > 0) {
                        const catP = document.createElement('p');
                        const strongCat = document.createElement('strong');
                        strongCat.textContent = cat + ':';
                        catP.appendChild(strongCat);
                        resultsDiv.appendChild(catP);

                        const catPre = document.createElement('pre');
                        catPre.textContent = arr.join('\n');
                        catPre.style.whiteSpace = 'pre-wrap';
                        catPre.style.background = '#f7f7f7';
                        catPre.style.padding = '8px';
                        catPre.style.borderRadius = '3px';
                        resultsDiv.appendChild(catPre);
                    }
                });
            }
        }

        // Government warning: show full text if present on the server response
        const detected = data && (data.Detected || data.detected);
        if (detected && detected.GovernmentWarning && detected.GovernmentWarning.Text) {
            const gw = detected.GovernmentWarning;
            const gwHeader = document.createElement('p');
            const strongGw = document.createElement('strong');
            strongGw.textContent = 'Government Warning Text:';
            gwHeader.appendChild(strongGw);
            card.appendChild(gwHeader);

            const pre = document.createElement('pre');
            pre.textContent = gw.Text;
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.background = '#f7f7f7';
            pre.style.padding = '8px';
            pre.style.borderRadius = '3px';
            card.appendChild(pre);
        }

        // Requirements: user-friendly summary of core TTB checks
        const req = data && (data.Requirements || data.requirements);
        if (req) {
            const reqHeader = document.createElement('h3');
            reqHeader.textContent = 'Requirements';
            reqHeader.style.marginTop = '12px';
            card.appendChild(reqHeader);

            const friendlyList = document.createElement('div');
            friendlyList.className = 'compliance-report';

            // helper to get values robustly from server response
            const getPassed = (obj) => (obj && (obj.Passed ?? obj.passed)) ? true : false;
            const getDetected = (obj) => (obj && (obj.Detected ?? obj.detected)) ? (obj.Detected ?? obj.detected) : null;

            // Prefer values from data.Detected if present for clearer explanations
            const dd = data && (data.Detected || data.detected) ? (data.Detected || data.detected) : {};

            // Parse alcohol percentage from detected text/value
            const parseAbv = (txt) => {
                if (!txt) return null;
                try {
                    // percent pattern
                    const m = /([0-9]+(?:\.[0-9]+)?)\s*%/.exec(txt);
                    if (m) return parseFloat(m[1]);
                    // proof pattern -> convert to ABV
                    const mp = /([0-9]+(?:\.[0-9]+)?)\s*(?:proof)\b/i.exec(txt);
                    if (mp) return parseFloat(mp[1]) / 2.0;
                    // fallback: first number
                    const mn = /([0-9]+(?:\.[0-9]+)?)/.exec(txt);
                    if (mn) return parseFloat(mn[1]);
                } catch (e) { }
                return null;
            };

            const checkAbvAgainstClass = (classType, abv) => {
                if (abv == null || isNaN(abv)) return {within: null, explanation: 'Alcohol % could not be parsed.'};
                const c = (classType || '').toLowerCase();
                // Default ranges (simplified)
                const ranges = [
                    {match: /whiskey|bourbon|rye|scotch|brandy|gin|rum|tequila|mezcal/, min: 40, max: 96, label: 'Distilled spirits (e.g., Whiskey, Bourbon, Gin, Rum, Tequila) — typically bottled at ≥40% ABV'},
                    {match: /vodka|neutral/, min: 40, max: 100, label: 'Vodka / Neutral spirits — bottled ≥40% ABV (production may use higher distillation proof)'},
                    {match: /wine/, min: 7, max: 24, label: 'Wine — table wine ~7–14% ABV, fortified up to ~24% ABV'},
                    {match: /beer|malt/, min: 0.5, max: 50, label: 'Beer/Malt beverages — typically ≥0.5% ABV'}
                ];
                for (const r of ranges) {
                    if (r.match.test(c)) {
                        const within = (abv >= r.min && abv <= r.max);
                        const explanation = `Measured ${abv}% ABV. ${within ? 'Within' : 'Outside'} expected range for ${r.label} (${r.min}%–${r.max}% ABV).`;
                        return { within, explanation };
                    }
                }
                // Unknown class: apply a conservative check for distilled spirits (>=40)
                const within = abv >= 40;
                const explanation = `Measured ${abv}% ABV. ${within ? 'Meets' : 'Does not meet'} general distilled spirits baseline (≥40% ABV).`;
                return { within, explanation };
            };

            // compute ABV check
            const detectedAlcoholText = (dd.AlcoholContent && (dd.AlcoholContent.Value || dd.AlcoholContent.value)) || (req.AlcoholContent && (req.AlcoholContent.Detected || req.AlcoholContent.detected)) || null;
            const parsedAbv = parseAbv(detectedAlcoholText);
            const detectedClass = (dd.ClassType && (dd.ClassType.Value || dd.ClassType.value)) || (dd.ClassType || '');
            const abvCheck = checkAbvAgainstClass(detectedClass, parsedAbv);

            const items = [
                { key: 'GovernmentWarning', title: 'Government Warning', value: (getDetected(req['GovernmentWarning']) || (dd.GovernmentWarning && dd.GovernmentWarning.Text) || null) },
                { key: 'AlcoholContent', title: 'Alcohol Content', value: (getDetected(req['AlcoholContent']) || (dd.AlcoholContent && dd.AlcoholContent.Value) || null), abvCheck },
                { key: 'BrandName', title: 'Brand Name', value: (getDetected(req['BrandName']) || (dd.Brand && dd.Brand.Value) || null) },
                { key: 'NetContents', title: 'Net Contents', value: (getDetected(req['NetContents']) || (dd.NetContents && dd.NetContents.Value) || null) },
                { key: 'ProducerInfo', title: 'Producer / Bottler', value: (getDetected(req['ProducerInfo']) || (dd.Bottler && dd.Bottler.Value) || null) }
            ];

            items.forEach(it => {
                const obj = req[it.key] || req[it.key.toLowerCase()] || {};
                let passed = getPassed(obj);

                const row = document.createElement('div');
                row.className = 'report-row';

                const left = document.createElement('div');
                left.className = 'left';
                const title = document.createElement('div');
                title.className = 'title';
                title.textContent = it.title;
                left.appendChild(title);

                const hint = document.createElement('div');
                hint.className = 'desc';
                const detected = it.value;
                if (it.key === 'AlcoholContent' && it.abvCheck) {
                    // use abvCheck explanation and override pass/fail
                    const chk = it.abvCheck;
                    hint.textContent = chk.explanation;
                    // override passed for alcohol check if within is boolean
                    if (chk.within !== null) {
                        passed = !!chk.within;
                    }
                } else if (detected && typeof detected === 'object' && detected.Text) {
                    hint.textContent = `${detected.Text.substring(0, 220)}`;
                } else if (typeof detected === 'string' && detected.length > 0) {
                    hint.textContent = detected.length > 220 ? detected.substring(0, 220) + '...' : detected;
                } else if (obj && obj.Detected && typeof obj.Detected === 'string' && obj.Detected.length > 0) {
                    hint.textContent = obj.Detected;
                } else {
                    hint.textContent = passed ? 'Detected' : 'Not detected';
                }
                left.appendChild(hint);

                const right = document.createElement('div');
                right.className = 'status';
                const pill = document.createElement('span');
                pill.className = 'status-pill ' + (passed ? 'pass' : 'fail');
                pill.textContent = passed ? 'PASS' : 'FAIL';
                right.appendChild(pill);

                row.appendChild(left);
                row.appendChild(right);
                friendlyList.appendChild(row);
            });

            card.appendChild(friendlyList);

            // show concise failed reasons below if present
            const failed = req.FailedReasons || req.failedReasons || req.Failed || req.failed;
            if (Array.isArray(failed) && failed.length > 0) {
                const failedHeader = document.createElement('p');
                failedHeader.innerHTML = '<strong>Why this failed</strong>';
                failedHeader.style.marginTop = '12px';
                card.appendChild(failedHeader);

                const ul = document.createElement('ul');
                ul.style.color = '#721c24';
                failed.forEach(f => {
                    const li = document.createElement('li');
                    li.textContent = f;
                    ul.appendChild(li);
                });
                card.appendChild(ul);
            }
        }

        // append card to results
        resultsDiv.appendChild(card);
    }
    catch (err) {
        console.error('showResults error:', err);
    }
}

// Make uploadImage available and wire the button
if (typeof window !== 'undefined') {
    window.uploadImage = uploadImage;
    const bindButton = function () {
        const btn = document.getElementById('uploadBtn');
        console.log('bindButton: found uploadBtn=', !!btn);
        if (btn && !btn._bound) {
            btn._bound = true;
            btn.addEventListener('click', function () {
                try {
                    const fileInputEl = document.getElementById('fileInput');
                    // If no file selected, open file picker instead of attempting upload
                    if (!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]) {
                        if (fileInputEl) fileInputEl.click();
                        return;
                    }

                    btn.disabled = true;
                    uploadImage();
                    setTimeout(() => btn.disabled = false, 2000);
                } catch (e) {
                    console.error('upload button handler error', e);
                }
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButton);
    } else {
        bindButton();
    }

    // make clicking the upload area open the file picker
    try {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const fileNameEl = document.getElementById('fileName');
        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', function (e) {
                // if user clicked the actual button inside, let button handler manage
                if (e.target && e.target.id === 'uploadBtn') return;
                fileInput.click();
            });

            fileInput.addEventListener('change', function () {
                if (fileNameEl && fileInput.files && fileInput.files[0]) {
                    fileNameEl.textContent = fileInput.files[0].name;
                }
                // auto-start upload after a file is selected to reduce confusion
                try {
                    // small delay to allow UI updates
                    setTimeout(() => {
                        uploadImage();
                    }, 150);
                } catch (e) {
                    console.error('auto upload error', e);
                }
            });
        }
    } catch (e) {
        console.error('uploadArea wiring error', e);
    }
}
