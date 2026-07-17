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
    const countEl = document.getElementById('count');
    if (countEl) {
        countEl.innerText = cart.length;
    }
}

function addToCart(productId) {
    const product = window.productData;
    if (!product) return;

    cart = loadCart();
    cart.push(product);
    saveCart();
    updateCartCount();
}

async function loadProduct() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const container = document.getElementById('product-detail');

    if (!container) return;

    if (!productId) {
        container.innerHTML = '<p>Product not found.</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${productId}`);
        if (!response.ok) throw new Error('Product not found');
        const product = await response.json();
        window.productData = product;

        container.innerHTML = `
            <img src="${product.image}" alt="${product.name}">
            <div class="product-detail-content">
                <h2>${product.name}</h2>
                <div class="product-price">₦${product.price.toLocaleString()}</div>
                <div class="product-meta">
                    <span>Free delivery</span>
                    <span>Secure checkout</span>
                    <span>Fast shipping</span>
                </div>
                <p class="product-description">${product.description || 'No description available yet.'}</p>
                <div class="card-actions">
                    <button onclick="addToCart(${product.id})">Add To Cart</button>
                    <a class="details-link" href="cart.html">Go to Cart</a>
                </div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p>Product not found.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    loadProduct();
});
