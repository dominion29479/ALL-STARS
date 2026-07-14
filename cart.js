function loadCart() {
    try {
        const storedCart = localStorage.getItem("cart");
        if (!storedCart) return [];
        const parsedCart = JSON.parse(storedCart);
        return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
        localStorage.removeItem("cart");
        return [];
    }
}

function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
}

let cart = loadCart();
let currentUser = JSON.parse(localStorage.getItem("authUser")) || null;
const API_BASE_URL = window.location.protocol.startsWith('http') ? window.location.origin : 'https://tech-choice-store-trd.onrender.com';
let pendingPaystackRef = null;

const cartItems = document.getElementById("cart-items");
const total = document.getElementById("total");
const checkoutActions = document.getElementById("checkout-actions");
const checkoutMain = document.getElementById("checkout-main");
const checkoutSummary = document.getElementById("checkout-summary");
const checkoutForm = document.getElementById("checkout-form");
const checkoutWrapper = document.getElementById("checkout-wrapper");
const confirmationMessage = document.getElementById("confirmation-message");
const authPanel = document.getElementById("auth-panel");
const authMessage = document.getElementById("auth-message");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const logoutBtn = document.getElementById("logout-btn");
const socialButtons = document.querySelectorAll(".social-btn");
const authToggleButtons = document.querySelectorAll(".auth-toggle-btn");
const signinSection = document.getElementById("signin-section");
const signupSection = document.getElementById("signup-section");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const shippingSelect = document.getElementById("shipping");
const paymentMethodSelect = document.getElementById("payment-method");
const paymentInfo = document.getElementById("payment-info");
const paystackBtn = document.getElementById("paystack-btn");
const addressInput = document.getElementById("address");
const shippingHelp = document.getElementById("shipping-help");
const PAYSTACK_PUBLIC_KEY = 'pk_live_10bd3ec11aadcf55a7c9271fb62121ce938244cd';

function debugMessage(msg) {
    console.debug('[cart-debug]', msg);
    try {
        if (confirmationMessage) {
            confirmationMessage.style.display = 'block';
            confirmationMessage.textContent = String(msg);
        }
    } catch (e) {
        // ignore
    }
}

async function safeParseJSON(response) {
    // Read full text, then try JSON.parse. This avoids "Unexpected end of JSON input" when
    // the response body is empty or not valid JSON.
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`Invalid JSON response: ${text}`);
    }
}

async function preinitPaystack(email, amount) {
    pendingPaystackRef = null;
    try {
        const resp = await fetch(`${API_BASE_URL}/api/paystack/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, amount: Math.round(amount) })
        });

        const result = await safeParseJSON(resp);
        if (!resp.ok) {
            console.warn('Paystack pre-init failed', resp.status, result);
            return;
        }

        pendingPaystackRef = result?.data?.reference || null;
        window._pendingPaystackRef = pendingPaystackRef;
        console.log('Paystack pre-initialized, ref=', pendingPaystackRef);
        debugMessage('Paystack pre-init ref: ' + (pendingPaystackRef || 'none'));
    } catch (err) {
        console.warn('Paystack pre-init error', err);
        pendingPaystackRef = null;
    }
}

function syncCartFromStorage() {
    cart = loadCart();
    return cart;
}

function getCartTotal() {
    syncCartFromStorage();
    return cart.reduce((sum, item) => sum + item.price, 0);
}

function getShippingFee(shippingMethod) {
    if (shippingMethod === 'express') {
        return getCartTotal() * 0.05;
    }
    return 0;
}

function getFinalTotal(shippingMethod) {
    return getCartTotal() + getShippingFee(shippingMethod);
}

function setAuthMessage(message, isError = false) {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.classList.toggle('auth-error', isError);
}

function setAuthMode(mode) {
    if (signinSection) signinSection.classList.toggle('hidden', mode !== 'signin');
    if (signupSection) signupSection.classList.toggle('hidden', mode !== 'signup');
    authToggleButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === mode);
    });
}

function showConfirmationMessage(message, isError = false, includeOrdersLink = false) {
    if (!confirmationMessage) return;
    confirmationMessage.style.display = 'block';
    confirmationMessage.classList.toggle('confirmation-error', isError);
    if (includeOrdersLink) {
        confirmationMessage.innerHTML = `${message} <a href="orders.html" class="order-link">View your orders</a>`;
    } else {
        confirmationMessage.textContent = message;
    }
}

function renderAuthUI() {
    if (!authPanel) return;

    if (currentUser) {
        authPanel.classList.add('authenticated');
        if (loginForm) loginForm.classList.add('hidden');
        if (signupForm) signupForm.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (signinSection) signinSection.classList.add('hidden');
        if (signupSection) signupSection.classList.add('hidden');
        setAuthMessage(`Signed in as ${currentUser.name || currentUser.email}`);
    } else {
        authPanel.classList.remove('authenticated');
        if (loginForm) loginForm.classList.remove('hidden');
        if (signupForm) signupForm.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        setAuthMessage('Sign in or create an account to continue checkout.');
        setAuthMode('signin');
    }

    if (checkoutWrapper) {
        checkoutWrapper.style.display = currentUser ? 'block' : 'none';
    }

    if (nameInput && currentUser && !nameInput.value) {
        nameInput.value = currentUser.name || '';
    }

    if (emailInput && currentUser && !emailInput.value) {
        emailInput.value = currentUser.email || '';
    }
}

function renderCheckoutActions() {
    if (!checkoutActions) return;

    syncCartFromStorage();

    if (cart.length === 0) {
        checkoutActions.innerHTML = '<p style="color:white;">Add items to your cart to checkout.</p>';
        if (checkoutMain) checkoutMain.style.display = 'none';
        return;
    }

    checkoutActions.innerHTML = '<a href="#" class="checkout-btn" id="show-checkout-btn">Pay Now</a>';
    const showCheckoutBtn = document.getElementById('show-checkout-btn');
    if (showCheckoutBtn) {
        showCheckoutBtn.addEventListener('click', (event) => {
            event.preventDefault();
            if (checkoutMain) {
                checkoutMain.style.display = 'grid';
                renderCheckoutSummary();
                if (confirmationMessage) confirmationMessage.style.display = 'none';
            }

            if (!currentUser) {
                renderAuthUI();
                setAuthMessage('Please sign in or create an account before you pay.', true);
                if (authPanel) {
                    authPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                renderAuthUI();
                // Pre-initialize Paystack so opening the popup on submit is synchronous
                try {
                    const shippingMethod = shippingSelect?.value || 'standard';
                    const total = getFinalTotal(shippingMethod);
                    if (total > 0 && window.PaystackPop) {
                        preinitPaystack(currentUser.email, Math.round(total));
                    }
                } catch (e) {
                    console.warn('Paystack pre-init attempt failed', e);
                }
            }
        });
    }
}

function renderCheckoutSummary() {
    if (!checkoutSummary) return;

    syncCartFromStorage();

    if (cart.length === 0) {
        checkoutSummary.innerHTML = '<p style="color:white;">Your cart is empty.</p>';
        return;
    }

    const shippingMethod = shippingSelect?.value || 'standard';
    const itemList = cart.map(item => `<li>${item.name} - ₦${item.price.toLocaleString()}</li>`).join('');
    const shippingFee = getShippingFee(shippingMethod);
    const finalTotal = getFinalTotal(shippingMethod);
    checkoutSummary.innerHTML = `
        <h2>Order Summary</h2>
        <p><strong>${cart.length}</strong> item${cart.length !== 1 ? 's' : ''}</p>
        <ul style="padding-left: 18px; color: white;">${itemList}</ul>
        <p>Subtotal: ₦${getCartTotal().toLocaleString()}</p>
        <p>Shipping: ${shippingMethod === 'express' ? `Express Delivery (+5%) — ₦${shippingFee.toLocaleString()}` : shippingMethod === 'pickup' ? 'Pickup — Free' : 'Standard Delivery — Free'}</p>
        <p><strong>Total: ₦${finalTotal.toLocaleString()}</strong></p>
    `;
}

function displayCart() {
    if (!cartItems || !total) return;

    syncCartFromStorage();
    cartItems.innerHTML = "";
    let grandTotal = 0;

    if (cart.length === 0) {
        cartItems.innerHTML = '<p style="color:white; text-align:center;">Your cart is empty.</p>';
    }

    cart.forEach((item, index) => {
        grandTotal += item.price;
        cartItems.innerHTML += `
        <div class="card">
            <img src="${item.image}" alt="${item.name}">
            <h3>${item.name}</h3>
            <h2>₦${item.price.toLocaleString()}</h2>
            <button onclick="removeItem(${index})">
                Remove
            </button>
        </div>
        `;
    });

    total.innerText = grandTotal.toLocaleString();
    renderCheckoutActions();
    // If checkout is visible, refresh the Paystack pre-init reference
    try {
        if (checkoutMain && checkoutMain.style.display !== 'none' && currentUser && window.PaystackPop) {
            const shippingMethod = shippingSelect?.value || 'standard';
            const finalTotal = getFinalTotal(shippingMethod);
            if (finalTotal > 0) preinitPaystack(currentUser.email, Math.round(finalTotal));
        }
    } catch (e) {
        console.warn('Error attempting preinit on cart update', e);
    }
    if (checkoutMain && cart.length === 0) {
        checkoutMain.style.display = 'none';
    }
}

function removeItem(index) {
    cart.splice(index, 1);
    saveCart();
    displayCart();
}

function clearCart() {
    cart.splice(0, cart.length);
    localStorage.removeItem('cart');
    displayCart();
}

async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    const form = mode === 'login' ? loginForm : signupForm;
    if (!form) return;

    const formData = new FormData(form);
    const payload = mode === 'login'
        ? { email: String(formData.get('email') || '').trim(), password: String(formData.get('password') || '').trim() }
        : {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            password: String(formData.get('password') || '').trim()
        };

    try {
        const endpoint = mode === 'login' ? `${API_BASE_URL}/api/auth/login` : `${API_BASE_URL}/api/auth/register`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await safeParseJSON(response);
        if (!response.ok) {
            throw new Error(result?.error || result?.message || 'Authentication failed.');
        }
        if (!result || !result.user) {
            throw new Error('Authentication response was invalid.');
        }

        currentUser = result.user;
        localStorage.setItem('authUser', JSON.stringify(currentUser));
        localStorage.setItem('authToken', result.token || '');
        renderAuthUI();
        populateCheckoutFields();
        if (confirmationMessage) {
            confirmationMessage.style.display = 'block';
            confirmationMessage.textContent = `Welcome, ${currentUser.name || currentUser.email}! You can now pay securely.`;
        }
        form.reset();
    } catch (error) {
        if (confirmationMessage) {
            const message = String(error.message || '').toLowerCase().includes('failed to fetch')
                ? 'Unable to contact the server. Make sure the backend is running and reload the page.'
                : `Account error: ${error.message}`;
            confirmationMessage.style.display = 'block';
            confirmationMessage.textContent = message;
        }
    }
}

function populateCheckoutFields() {
    if (!currentUser) return;
    if (nameInput && !nameInput.value) {
        nameInput.value = currentUser.name || '';
    }
    if (emailInput && !emailInput.value) {
        emailInput.value = currentUser.email || '';
    }
}

function updateShippingFields() {
    const shippingMethod = shippingSelect?.value || 'standard';
    const needsAddress = shippingMethod !== 'pickup';

    if (addressInput) {
        addressInput.required = needsAddress;
        addressInput.placeholder = needsAddress ? '123 Lagos Street, Abuja' : 'Pickup location will be shared after checkout';
    }

    if (shippingHelp) {
        shippingHelp.textContent = needsAddress
            ? 'Delivery orders need a delivery address.'
            : 'Pickup orders do not need a delivery address.';
    }
}

function updatePaymentInfo() {
    if (!paymentInfo) return;

    paymentInfo.innerHTML = 'Pay securely with Paystack. A secure checkout popup will open after you submit your order.';
}

if (loginForm) {
    loginForm.addEventListener('submit', (event) => handleAuthSubmit(event, 'login'));
}

if (signupForm) {
    signupForm.addEventListener('submit', (event) => handleAuthSubmit(event, 'signup'));
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('authUser');
        localStorage.removeItem('authToken');
        renderAuthUI();
        if (confirmationMessage) {
            confirmationMessage.style.display = 'block';
            confirmationMessage.textContent = 'You have been signed out.';
        }
    });
}

authToggleButtons.forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.mode));
});

socialButtons.forEach((button) => {
    button.addEventListener('click', async () => {
        const provider = button.dataset.provider;
        const providerName = provider === 'google' ? 'Google' : 'Apple';
        const email = window.prompt(`Enter your ${providerName} email to continue`);
        if (!email) return;
        const name = window.prompt(`Enter your name for this ${providerName} account`) || email.split('@')[0];

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, provider, providerId: `${provider}-${email}` })
            });

            const result = await safeParseJSON(response);
            if (!response.ok) {
                throw new Error(result?.error || result?.message || `${providerName} sign-in failed.`);
            }
            if (!result || !result.user) {
                throw new Error(`${providerName} sign-in returned invalid response.`);
            }

            currentUser = result.user;
            localStorage.setItem('authUser', JSON.stringify(currentUser));
            localStorage.setItem('authToken', result.token || '');
            renderAuthUI();
            populateCheckoutFields();
            if (confirmationMessage) {
                confirmationMessage.style.display = 'block';
                confirmationMessage.textContent = `${providerName} sign-in complete. You can now pay.`;
            }
        } catch (error) {
            if (confirmationMessage) {
                confirmationMessage.style.display = 'block';
                confirmationMessage.textContent = `Account error: ${error.message}`;
            }
        }
    });
});

window.addEventListener('storage', (event) => {
    if (event.key === 'cart') {
        syncCartFromStorage();
        displayCart();
        renderCheckoutSummary();
    }
});

if (shippingSelect) {
    shippingSelect.addEventListener('change', () => {
        updateShippingFields();
        renderCheckoutSummary();
        // refresh pre-init when shipping changes and checkout visible
        try {
            if (checkoutMain && checkoutMain.style.display !== 'none' && currentUser && window.PaystackPop) {
                const shippingMethod = shippingSelect?.value || 'standard';
                const finalTotal = getFinalTotal(shippingMethod);
                if (finalTotal > 0) preinitPaystack(currentUser.email, Math.round(finalTotal));
            }
        } catch (e) {
            console.warn('Error attempting preinit on shipping change', e);
        }
    });

    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('change', () => {
            updatePaymentInfo();
            if (paystackBtn) {
                paystackBtn.style.display = paymentMethodSelect.value === 'paystack' ? 'inline-flex' : 'none';
            }
        });
    }

    if (paystackBtn) {
        paystackBtn.addEventListener('click', () => {
            paymentMethodSelect.value = 'paystack';
            updatePaymentInfo();
            paystackBtn.style.display = 'none';
            checkoutForm.requestSubmit();
        });
    }

    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (cart.length === 0) return;
            if (!currentUser) {
                if (confirmationMessage) {
                    confirmationMessage.style.display = 'block';
                    confirmationMessage.textContent = 'Please sign in or create an account before placing your order.';
                }
                return;
            }

            const formData = new FormData(checkoutForm);
            const name = String(formData.get('name') || '').trim() || currentUser.name || '';
            const email = String(formData.get('email') || '').trim() || currentUser.email || '';
            const phone = String(formData.get('phone') || '').trim();
            const address = String(formData.get('address') || '').trim();
            const shipping = String(formData.get('shipping') || 'standard');
            const paymentMethod = 'paystack';

            if (!name || !email || !phone || (shipping !== 'pickup' && !address)) {
                if (confirmationMessage) {
                    confirmationMessage.style.display = 'block';
                    confirmationMessage.textContent = 'Please complete all checkout fields before placing your order.';
                }
                return;
            }

            const total = getFinalTotal(shipping);

            if (paymentMethod === 'paystack') {
                if (!window.PaystackPop) {
                    if (confirmationMessage) {
                        confirmationMessage.style.display = 'block';
                        confirmationMessage.textContent = 'Paystack is not available right now. Please refresh the page and try again.';
                    }
                    return;
                }

                // If we pre-initialized a Paystack reference, use it to open the popup synchronously
                if (pendingPaystackRef) {
                    try {
                        const reference = pendingPaystackRef;
                        const handler = window.PaystackPop.setup({
                            key: PAYSTACK_PUBLIC_KEY,
                            email,
                            amount: Math.round(total * 100),
                            currency: 'NGN',
                            ref: reference,
                            callback: function (response) {
                                (async () => {
                                    const payload = {
                                        reference: response.reference,
                                        customer: { name, email, phone, address },
                                        items: cart,
                                        shipping,
                                        paymentMethod: 'Paystack',
                                        total
                                    };

                                    try {
                                        const verifyResp = await fetch(`${API_BASE_URL}/api/paystack/verify`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(payload)
                                        });

                                        let verifyResult = null;
                                        try {
                                            verifyResult = await safeParseJSON(verifyResp);
                                        } catch (e) {
                                            throw new Error('Paystack verify: invalid response from server — ' + e.message);
                                        }

                                        if (!verifyResp.ok) {
                                            const errMsg = (verifyResult && (verifyResult.error || verifyResult.message)) || verifyResp.statusText || 'Payment verification failed.';
                                            throw new Error(errMsg);
                                        }

                                        if (confirmationMessage) {
                                            showConfirmationMessage(`Thank you, ${name}! Your payment was verified and order #${verifyResult.order.id} has been placed.`, false, true);
                                        }

                                        // clear preinit reference after use
                                        pendingPaystackRef = null;
                                        clearCart();
                                        checkoutForm.reset();
                                        if (checkoutMain) checkoutMain.style.display = 'none';
                                    } catch (error) {
                                        if (confirmationMessage) {
                                            showConfirmationMessage(`Verification error: ${error.message}`, true);
                                        }
                                    }
                                })().catch((err) => {
                                    console.error('Async verification wrapper error', err);
                                    if (confirmationMessage) {
                                        confirmationMessage.style.display = 'block';
                                        confirmationMessage.textContent = `Verification error: ${err.message}`;
                                    }
                                });
                            },
                            onClose: function () {
                                if (confirmationMessage) {
                                    confirmationMessage.style.display = 'block';
                                    confirmationMessage.textContent = 'Paystack checkout was closed before payment completed.';
                                }
                            }
                        });

                        try {
                            handler.openIframe();
                        } catch (popupError) {
                            console.warn('Paystack inline popup failed, falling back to direct redirect.', popupError);
                            const fallbackUrl = `https://checkout.paystack.com/${reference}`;
                            window.open(fallbackUrl, '_blank');
                        }
                    } catch (error) {
                        if (confirmationMessage) {
                            confirmationMessage.style.display = 'block';
                            confirmationMessage.textContent = `Paystack error: ${error.message}`;
                        }
                    }

                    return;
                }

                // Fallback: initialize now and open popup (original flow)
                try {
                    const initResp = await fetch(`${API_BASE_URL}/api/paystack/initialize`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, amount: Math.round(total) })
                    });

                    let initResult = null;
                    try {
                        initResult = await safeParseJSON(initResp);
                    } catch (e) {
                        throw new Error('Paystack initialize: invalid response from server — ' + e.message);
                    }

                    if (!initResp.ok) {
                        const errMsg = (initResult && (initResult.error || initResult.message)) || initResp.statusText || 'Failed to initialize Paystack transaction.';
                        console.error('Paystack init failed response', { status: initResp.status, body: initResult });
                        throw new Error(errMsg);
                    }

                    const reference = initResult?.data?.reference;
                    console.log('Paystack init reference', reference, initResult);
                    if (!reference) throw new Error('Paystack initialization did not return a payment reference.');

                    const handler = window.PaystackPop.setup({
                        key: PAYSTACK_PUBLIC_KEY,
                        email,
                        amount: Math.round(total * 100),
                        currency: 'NGN',
                        ref: reference,
                        callback: function (response) {
                            // wrap async work inside a normal function to avoid any Paystack callback validation issues
                            (async () => {
                                const payload = {
                                    reference: response.reference,
                                    customer: { name, email, phone, address },
                                    items: cart,
                                    shipping,
                                    paymentMethod: 'Paystack',
                                    total
                                };

                                try {
                                    const verifyResp = await fetch(`${API_BASE_URL}/api/paystack/verify`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(payload)
                                    });

                                    let verifyResult = null;
                                    try {
                                        verifyResult = await safeParseJSON(verifyResp);
                                    } catch (e) {
                                        throw new Error('Paystack verify: invalid response from server — ' + e.message);
                                    }

                                    if (!verifyResp.ok) {
                                        const errMsg = (verifyResult && (verifyResult.error || verifyResult.message)) || verifyResp.statusText || 'Payment verification failed.';
                                        throw new Error(errMsg);
                                    }

                                    if (confirmationMessage) {
                                        showConfirmationMessage(`Thank you, ${name}! Your payment was verified and order #${verifyResult.order.id} has been placed.`, false, true);
                                    }

                                    clearCart();
                                    checkoutForm.reset();
                                    if (checkoutMain) checkoutMain.style.display = 'none';
                                } catch (error) {
                                    if (confirmationMessage) {
                                        showConfirmationMessage(`Verification error: ${error.message}`, true);
                                    }
                                }
                            })().catch((err) => {
                                console.error('Async verification wrapper error', err);
                                if (confirmationMessage) {
                                    confirmationMessage.style.display = 'block';
                                    confirmationMessage.textContent = `Verification error: ${err.message}`;
                                }
                            });
                        },
                        onClose: function () {
                            if (confirmationMessage) {
                                confirmationMessage.style.display = 'block';
                                confirmationMessage.textContent = 'Paystack checkout was closed before payment completed.';
                            }
                        }
                    });

                    try {
                        handler.openIframe();
                    } catch (popupError) {
                        console.warn('Paystack inline popup failed, falling back to direct redirect.', popupError);
                        const fallbackUrl = `https://checkout.paystack.com/${reference}`;
                        window.open(fallbackUrl, '_blank');
                    }
                } catch (error) {
                    if (confirmationMessage) {
                        confirmationMessage.style.display = 'block';
                        confirmationMessage.textContent = `Paystack error: ${error.message}`;
                    }
                }

                return;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderAuthUI();
        displayCart();
        updateShippingFields();
        updatePaymentInfo();
        renderCheckoutSummary();
        // If the page is opened via file://, Paystack popup may be blocked or fail.
        if (window.location.protocol === 'file:') {
            debugMessage('Warning: open this page via http://localhost:3000/cart.html (run the server) for Paystack to work reliably.');
        }
    });
}
