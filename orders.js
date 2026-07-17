function formatDate(value) {
    if (!value) return 'Soon';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Soon' : date.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

const API_BASE_URL = window.location.protocol.startsWith('http') ? window.location.origin : 'https://allstars.onrender.com';

function getStatusMeta(status) {
    const normalized = String(status || 'pending').toLowerCase();
    const map = {
        pending: { label: 'Order placed', tone: 'pending', step: 1 },
        fulfilled: { label: 'Delivered', tone: 'fulfilled', step: 3 },
        cancelled: { label: 'Cancelled', tone: 'cancelled', step: 0 }
    };
    return map[normalized] || map.pending;
}

async function cancelOrder(orderId) {
    if (!orderId) return;
    const confirmed = window.confirm('Cancel this order?');
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to cancel order.');
        await fetchOrders();
    } catch (error) {
        const container = document.getElementById('orders-container');
        if (container) {
            container.innerHTML = `<div class="orders-empty">${error.message}</div>`;
        }
    }
}

function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (!Array.isArray(orders) || orders.length === 0) {
        container.innerHTML = '<div class="orders-empty">You have no orders yet. Place an order to see it here.</div>';
        return;
    }

    container.innerHTML = '';
    orders.forEach((order) => {
        const el = document.createElement('article');
        el.className = 'order-card';
        const created = new Date(order.created_at || order.createdAt || Date.now()).toLocaleString();
        const statusMeta = getStatusMeta(order.status);
        const itemCount = Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) : 0;

        el.innerHTML = `
            <div class="order-card-header">
                <div>
                    <h3>Order #${order.id}</h3>
                    <p class="order-date">Placed on ${created}</p>
                </div>
                <div class="order-actions">
                    <span class="order-status ${statusMeta.tone}">${statusMeta.label}</span>
                    ${statusMeta.tone === 'pending' ? `<button class="cancel-btn" onclick="cancelOrder(${order.id})">Cancel order</button>` : ''}
                </div>
            </div>
            <div class="order-summary">
                <div><strong>Total:</strong> ₦${Number(order.total || 0).toLocaleString()}</div>
                <div><strong>Items:</strong> ${itemCount}</div>
                <div><strong>Shipping:</strong> ${order.shipping || 'Standard'}</div>
            </div>
            <div class="tracking-row">
                <div class="tracking-step ${statusMeta.step >= 1 ? 'active' : ''}">Order placed</div>
                <div class="tracking-step ${statusMeta.step >= 2 ? 'active' : ''}">Packed</div>
                <div class="tracking-step ${statusMeta.step >= 3 ? 'active' : ''}">Delivered</div>
            </div>
            <div class="order-details">
                <div><strong>Customer:</strong> ${order.customer?.name || '—'}</div>
                <div><strong>Address:</strong> ${order.customer?.address || '—'}</div>
            </div>
            <div class="order-updates">
                <div class="eta-pill">Estimated delivery: ${order.estimatedDelivery ? formatDate(order.estimatedDelivery) : 'Soon'}</div>
                ${Array.isArray(order.updates) ? order.updates.map((update) => `
                    <div class="update-bubble">
                        <strong>${update.title}</strong>
                        <div>${update.message}</div>
                        <small>${formatDate(update.time)}</small>
                    </div>
                `).join('') : ''}
            </div>
            <div class="items">
                ${Array.isArray(order.items) && order.items.length ? order.items.map((item) => `
                    <div class="item">
                        <img src="${item.image || 'images/placeholder.png'}" alt="${item.name || ''}">
                        <div>
                            <div>${item.name || ''} x ${item.quantity || 1}</div>
                            <div>₦${Number(item.price || 0).toLocaleString()}</div>
                        </div>
                    </div>
                `).join('') : '<div class="items-empty">No items listed for this order.</div>'}
            </div>
        `;
        container.appendChild(el);
    });
}

async function fetchOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    const authUser = JSON.parse(localStorage.getItem('authUser') || 'null');
    if (!authUser?.email) {
        container.innerHTML = '<div class="orders-empty">Sign in to view your order history and tracking updates.</div>';
        return;
    }

    container.innerHTML = 'Loading your orders...';
    try {
        const res = await fetch(`${API_BASE_URL}/api/orders?email=${encodeURIComponent(authUser.email)}`);
        if (!res.ok) throw new Error('Failed to load orders');
        const orders = await res.json();
        renderOrders(orders);
    } catch (err) {
        container.innerHTML = `<div class="orders-empty">Error loading orders: ${err.message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchOrders();
});
