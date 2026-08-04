const defaultProducts = [
    { id: 1, name: "HDMI VIDEO CAPTURE", price: 450000, image: "images/ghj.png", description: "A compact video capture card used to record or stream video/audio directly from consoles, cameras, or computers to a PC." },
    { id: 2, name: "ETHRANET ADAPTER", price: 250000, image: "images/1.png", description: "Instantly add a reliable, wired RJ45 network port to your computer with the USB 3.0 to Gigabit Ethernet Adapter." },
    { id: 3, name: "USB ACTIVE REPEATER", price: 35000, image: "images/2.png", description: "The USB Active Repeater Cable is an active extension cable designed to extend the reach of your USB connection over long distances without signal degradation" },
    { id: 4, name: "PORTABLE POWER SUPPLY", price: 60000, image: "images/poe.png", description: "The POE-431P Mini DC UPS is a compact, multi-functional uninterruptible power supply designed to keep your essential network hardware running seamlessly during power outages" }
];

let products = defaultProducts.slice();

function loadCart() {
    try {
        const storedCart = localStorage.getItem('cart');
        if (!storedCart) return [];
        const parsedCart = JSON.parse(storedCart);
        return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
        localStorage.removeItem('cart');
        return [];
    }
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

let cart = loadCart();
const API_BASE_URL = window.location.origin.includes('3000') ? window.location.origin : 'https://all-stars-1.onrender.com';

function updateCartCount() {
    const countEl = document.getElementById("count");
    if (countEl) {
        countEl.innerText = cart.length;
    }
}

function renderProducts(filter = '') {
    const productContainer = document.getElementById("products");
    const heroSection = document.querySelector('.hero');
    const searchStatus = document.getElementById('search-status');
    if (!productContainer) return;

    const q = String(filter).trim().toLowerCase();
    if (heroSection) {
        heroSection.classList.toggle('hidden', q.length > 0);
    }
    productContainer.innerHTML = '';
    const list = products.filter(p => p.name.toLowerCase().includes(q));
    if (list.length === 0) {
        productContainer.innerHTML = '<p style="color:white;">No products found.</p>';
        if (searchStatus) searchStatus.textContent = '0 products found';
        return;
    }
    list.forEach(product => {
        productContainer.innerHTML += `
            <div class="card">
                <img src="${product.image}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>${product.description || ''}</p>
                <h2>₦${product.price.toLocaleString()}</h2>
                <div class="card-actions">
                    <a class="details-link" href="product.html?id=${product.id}">View Details</a>
                    <button onclick="addToCart(${product.id})">Add To Cart</button>
                </div>
            </div>
        `;
    });
    if (searchStatus) searchStatus.textContent = `${list.length} product${list.length !== 1 ? 's' : ''} found`;
}

async function fetchProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        if (!response.ok) {
            throw new Error('Unable to load products');
        }
        products = await response.json();
        try { renderProducts(); } catch (e) { /* ignore */ }
    } catch (error) {
        console.error(error);
        products = defaultProducts.slice();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchProducts();
    const productContainer = document.getElementById("products");
    const searchInput = document.getElementById('search');
    const searchClear = document.getElementById('search-clear');
    const searchStatus = document.getElementById('search-status');
    const heroSection = document.querySelector('.hero');
    if (!productContainer) return;

    renderProducts();

    function debounce(fn, delay = 200) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
    }

    if (searchInput) {
        const onInput = debounce((value) => renderProducts(value), 180);
        searchInput.addEventListener('input', (e) => onInput(e.target.value));

        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                renderProducts('');
                searchInput.focus();
            });
        }

        const searchForm = document.getElementById('search-form');
        if (searchForm) searchForm.addEventListener('submit', (ev) => ev.preventDefault());
    }

    updateCartCount();

    // listen for product updates from admin in other tabs/windows
    window.addEventListener('storage', (e) => {
        if (e.key === 'products_updated') {
            fetchProducts();
        }
    });
});

function addToCart(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    cart.push(product);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
}