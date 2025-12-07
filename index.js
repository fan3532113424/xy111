const PlantState = {
    // 植物数据
    plants: {},

    // 互动数据
    interactions: {
        likes: {},
        favorites: {},
        comments: {},
        userData: {
            likes: new Set(),
            favorites: new Set()
        }
    },

    // 当前用户
    currentUser: localStorage.getItem('currentUser') || '',

    // 更新函数
    updatePlantInteraction(plantId, type, count, userAction = null) {
        if (type === 'like') {
            this.interactions.likes[plantId] = count;
        } else if (type === 'favorite') {
            this.interactions.favorites[plantId] = count;
        } else if (type === 'comment') {
            this.interactions.comments[plantId] = count;
        }

        // 更新用户个人状态
        if (userAction !== null && this.currentUser) {
            const plantIdNum = parseInt(plantId);
            if (type === 'like') {
                if (userAction === 'add') {
                    this.interactions.userData.likes.add(plantIdNum);
                } else {
                    this.interactions.userData.likes.delete(plantIdNum);
                }
            } else if (type === 'favorite') {
                if (userAction === 'add') {
                    this.interactions.userData.favorites.add(plantIdNum);
                } else {
                    this.interactions.userData.favorites.delete(plantIdNum);
                }
            }
        }

        this.dispatchUpdate();
    },

    // 获取植物互动状态
    getPlantInteraction(plantId) {
        const id = parseInt(plantId);
        return {
            likes: this.interactions.likes[id] || 0,
            favorites: this.interactions.favorites[id] || 0,
            comments: this.interactions.comments[id] || 0,
            isLiked: this.interactions.userData.likes.has(id),
            isFavorited: this.interactions.userData.favorites.has(id)
        };
    },

    // 初始化用户数据
    async initUserData() {
        if (!this.currentUser) return;

        try {
            // 获取用户的点赞、收藏数据
            const [likesResponse, favoritesResponse] = await Promise.all([
                supabase.from('plant_likes').select('plant_id').eq('username', this.currentUser),
                supabase.from('plant_favorites').select('plant_id').eq('username', this.currentUser)
            ]);

            if (likesResponse.data) {
                likesResponse.data.forEach(like => {
                    this.interactions.userData.likes.add(like.plant_id);
                });
            }

            if (favoritesResponse.data) {
                favoritesResponse.data.forEach(favorite => {
                    this.interactions.userData.favorites.add(favorite.plant_id);
                });
            }
        } catch (error) {
            console.error('初始化用户数据失败:', error);
        }
    },

    // 事件分发
    dispatchUpdate() {
        window.dispatchEvent(new CustomEvent('plantStateUpdated'));
    }
};

// Supabase配置
const SUPABASE_URL = 'https://sgwbztuizxowiacpwzmy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnd2J6dHVpenhvd2lhY3B3em15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMzIyMDYsImV4cCI6MjA3OTkwODIwNn0.js6fUBJ9FGRMkVgp80Q-8D6hX-xXbr29rWKyJgOA9b4';

// 创建 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Supabase 初始化完成:', supabase);


// 全局变量
let userData = {
    id: 1,
    username: '',
    fullName: '',
    email: '',
    phone: '',
    department: '',
    studentId: '',
    bio: '',
    role: 'user',
    avatar: '',
    lastLogin: ''
};
let worksData = [];
let plantComments = {};
let favoritesData = [];
let currentCommentPlantId = null;
let map = null;
let currentMiniMap = null;
let markers = [];
let hoverInfoWindow = null;


document.addEventListener('DOMContentLoaded', function () {
    console.log('页面加载完成，开始初始化...');

    // 初始化用户状态
    PlantState.currentUser = localStorage.getItem('currentUser') || '';

    // 加载植物数据
    loadPlantData();

    // 初始化评论功能
    initCommentFunctionality();

    // 初始化应用
    initApp();
});

// 加载植物数据
async function loadPlantData() {
    console.log('开始加载植物数据...');
    PlantState.plants = await fetchPlantsFromSupabase();
    console.log('植物数据加载完成:', Object.keys(PlantState.plants).length);

    // 加载所有植物的互动数据
    await loadAllPlantInteractions();
}

// 加载所有植物的互动数据
async function loadAllPlantInteractions() {
    console.log('开始加载所有植物的互动数据...');

    try {
        // 初始化用户数据
        await PlantState.initUserData();

        // 批量获取所有植物的互动数量
        const plantIds = Object.keys(PlantState.plants).map(id => parseInt(id));

        if (plantIds.length === 0) {
            console.log('没有植物数据，跳过互动数据加载');
            return;
        }

        // 并行获取点赞、收藏、评论数量
        const [likesData, favoritesData, commentsData] = await Promise.all([
            getPlantInteractionCountsBatch(plantIds, 'likes'),
            getPlantInteractionCountsBatch(plantIds, 'favorites'),
            getPlantInteractionCountsBatch(plantIds, 'comments')
        ]);

        // 更新状态
        plantIds.forEach(plantId => {
            PlantState.updatePlantInteraction(plantId, 'like', likesData[plantId] || 0);
            PlantState.updatePlantInteraction(plantId, 'favorite', favoritesData[plantId] || 0);
            PlantState.updatePlantInteraction(plantId, 'comment', commentsData[plantId] || 0);
        });

        console.log('互动数据加载完成');
    } catch (error) {
        console.error('加载互动数据失败:', error);
    }
}

// 批量获取互动数量
async function getPlantInteractionCountsBatch(plantIds, type) {
    const tableName = type === 'likes' ? 'plant_likes' :
        type === 'favorites' ? 'plant_favorites' : 'plant_comments';

    try {
        const {data, error} = await supabase
            .from(tableName)
            .select('plant_id')
            .in('plant_id', plantIds);

        if (error) throw error;

        // 统计每个植物的数量
        const counts = {};
        if (data) {
            data.forEach(item => {
                const plantId = item.plant_id;
                counts[plantId] = (counts[plantId] || 0) + 1;
            });
        }

        // 确保所有植物都有计数
        plantIds.forEach(id => {
            if (!counts[id]) {
                counts[id] = 0;
            }
        });

        return counts;
    } catch (error) {
        console.error(`获取${type}数据失败:`, error);
        return {};
    }
}

// 获取单个植物的互动数量
async function getPlantInteractionCounts(plantId) {
    try {
        const [likesResponse, favoritesResponse, commentsResponse] = await Promise.all([
            supabase.from('plant_likes').select('*', {count: 'exact', head: true}).eq('plant_id', plantId),
            supabase.from('plant_favorites').select('*', {count: 'exact', head: true}).eq('plant_id', plantId),
            supabase.from('plant_comments').select('*', {count: 'exact', head: true}).eq('plant_id', plantId)
        ]);

        return {
            likes: likesResponse.count || 0,
            favorites: favoritesResponse.count || 0,
            comments: commentsResponse.count || 0
        };
    } catch (error) {
        console.error('获取植物互动数量失败:', error);
        return {likes: 0, favorites: 0, comments: 0};
    }
}

async function handleLike(plantId, button) {
    try {
        const currentUser = PlantState.currentUser;
        if (!currentUser) {
            alert('请先登录！');
            window.location.href = 'login.html';
            return;
        }

        const plantIdNum = parseInt(plantId);
        const isLiked = PlantState.interactions.userData.likes.has(plantIdNum);

        if (isLiked) {
            // 取消点赞
            const {error} = await supabase
                .from('plant_likes')
                .delete()
                .eq('plant_id', plantIdNum)
                .eq('username', currentUser);

            if (error) throw error;

            PlantState.updatePlantInteraction(plantId, 'like',
                PlantState.interactions.likes[plantIdNum] - 1, 'remove');
            button.classList.remove('active');
            showSuccessMessage('已取消点赞');
        } else {
            // 添加点赞
            const {error} = await supabase
                .from('plant_likes')
                .insert({
                    plant_id: plantIdNum,
                    username: currentUser,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;

            PlantState.updatePlantInteraction(plantId, 'like',
                PlantState.interactions.likes[plantIdNum] + 1, 'add');
            button.classList.add('active');
            showSuccessMessage('点赞成功！');
        }

    } catch (error) {
        console.error('处理点赞失败:', error);
        alert('操作失败，请重试！');
    }
}

async function handleFavorite(plantId, button) {
    try {
        const currentUser = PlantState.currentUser;
        if (!currentUser) {
            alert('请先登录！');
            window.location.href = 'login.html';
            return;
        }

        const plantIdNum = parseInt(plantId);
        const isFavorited = PlantState.interactions.userData.favorites.has(plantIdNum);

        if (isFavorited) {
            // 取消收藏
            const {error} = await supabase
                .from('plant_favorites')
                .delete()
                .eq('plant_id', plantIdNum)
                .eq('username', currentUser);

            if (error) throw error;

            PlantState.updatePlantInteraction(plantId, 'favorite',
                PlantState.interactions.favorites[plantIdNum] - 1, 'remove');
            button.classList.remove('active');
            showSuccessMessage('已取消收藏');
        } else {
            // 添加收藏
            const {error} = await supabase
                .from('plant_favorites')
                .insert({
                    plant_id: plantIdNum,
                    username: currentUser,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;

            PlantState.updatePlantInteraction(plantId, 'favorite',
                PlantState.interactions.favorites[plantIdNum] + 1, 'add');
            button.classList.add('active');
            showSuccessMessage('收藏成功！');
        }

    } catch (error) {
        console.error('处理收藏失败:', error);
        alert('操作失败，请重试！');
    }
}

function initCommentFunctionality() {
    console.log('初始化评论功能...');

    // 事件委托处理评论按钮点击
    document.addEventListener('click', function (event) {
        // 评论按钮点击
        if (event.target.closest('.plant-action-btn.comment')) {
            const btn = event.target.closest('.plant-action-btn.comment');
            const plantId = parseInt(btn.getAttribute('data-plant-id'));

            if (plantId) {
                event.preventDefault();
                event.stopPropagation();

                if (!PlantState.currentUser) {
                    alert('请先登录才能评论！');
                    window.location.href = 'login.html';
                    return;
                }

                openPlantCommentDrawer(plantId);
            }
        }

        // 关闭评论抽屉按钮
        if (event.target.closest('.close-plant-comment')) {
            const closeBtn = event.target.closest('.close-plant-comment');
            closePlantCommentDrawer();
        }

        // 提交评论按钮
        if (event.target.closest('#submitPlantCommentBtn')) {
            const plantId = currentCommentPlantId;
            if (plantId) {
                submitPlantComment(plantId);
            }
        }

        // 删除评论按钮
        if (event.target.closest('.delete-comment-btn')) {
            const deleteBtn = event.target.closest('.delete-comment-btn');
            const commentId = deleteBtn.getAttribute('data-comment-id');
            deletePlantComment(commentId);
        }

        // 回复评论按钮
        if (event.target.closest('.reply-comment-btn')) {
            const replyBtn = event.target.closest('.reply-comment-btn');
            const authorName = replyBtn.getAttribute('data-author');
            const commentInput = document.getElementById('plant-comment-input');
            commentInput.value = `@${authorName} `;
            commentInput.focus();
        }
    });

    // 回车键提交评论
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            const commentInput = document.getElementById('plant-comment-input');
            if (commentInput && commentInput === document.activeElement) {
                e.preventDefault();
                submitPlantComment(plantId);
            }
        }
    });

    console.log('评论功能初始化完成');
}

// 打开植物评论抽屉
async function openPlantCommentDrawer(plantId) {
    currentCommentPlantId = plantId;
    plantCommentDrawerOpen = true;

    // 显示评论抽屉
    const overlay = document.getElementById('plantCommentOverlay');
    const drawer = overlay.querySelector('.plant-comment-drawer');

    if (!overlay || !drawer) {
        console.error('评论抽屉元素未找到');
        return;
    }

    overlay.classList.add('active');
    setTimeout(() => {
        drawer.style.transform = 'translateY(0)';
    }, 10);

    // 设置植物名称
    const plant = worksData.find(p => p.id == plantId) || favoritesData.find(f => f.plant_id == plantId)?.plant;
    if (plant) {
        const headerTitle = drawer.querySelector('.plant-comment-header h3');
        if (headerTitle) {
            headerTitle.textContent = `${plant.name} 的评论`;
        }
    }

    // 加载评论
    await loadPlantComments(plantId);

    // 添加关闭按钮事件
    const closeBtn = drawer.querySelector('.close-plant-comment');
    if (closeBtn) {
        closeBtn.setAttribute('data-plant-id', plantId);
        closeBtn.onclick = () => closePlantCommentDrawer(plantId);
    }
    
    // 添加输入框回车事件
    const commentInput = drawer.querySelector('.plant-comment-input');
    if (commentInput) {
        commentInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPlantComment(plantId);
            }
        };
    }

    // 阻止滚动穿透
    document.body.style.overflow = 'hidden';
}

// 创建植物评论抽屉
function createPlantCommentDrawer() {
    console.log('创建评论抽屉');
    // 如果已经存在，先移除
    const existingOverlay = document.getElementById('plantCommentOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'plantCommentOverlay';
    overlay.className = 'plant-comment-overlay';

    overlay.innerHTML = `
            <div class="plant-comment-drawer">
                <div class="plant-comment-header">
                    <h3 id="plant-comment-title">评论</h3>
                    <button class="close-plant-comment" id="closePlantCommentBtn">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                <div class="plant-comment-content" id="plant-comments-container">
                    <div class="empty-state">
                        <i class="fa fa-spinner fa-spin text-gray-300 text-4xl mb-4"></i>
                        <p class="text-gray-500">加载评论中...</p>
                    </div>
                </div>
                <div class="plant-comment-input-area">
                    <textarea
                            class="plant-comment-input"
                            id="plant-comment-input"
                            placeholder="写下你的评论..."
                            rows="3"></textarea>
                    <button class="submit-plant-comment" id="submitPlantCommentBtn">
                        发表评论
                    </button>
                </div>
            </div>
        `;

    document.body.appendChild(overlay);
    console.log('评论抽屉创建完成');
}

// 关闭植物评论抽屉
function closePlantCommentDrawer(plantId) {
    plantCommentDrawerOpen = false;
    currentCommentPlantId = null;

    const overlay = document.getElementById('plantCommentOverlay');
    const drawer = overlay.querySelector('.plant-comment-drawer');

    if (!overlay || !drawer) {
        console.error('评论抽屉元素未找到');
        return;
    }

    drawer.style.transform = 'translateY(100%)';
    setTimeout(() => {
        overlay.classList.remove('active');
        // 恢复滚动
        document.body.style.overflow = '';
    }, 300);

    // 清理事件监听器
    const closeBtn = drawer.querySelector('.close-plant-comment');
    if (closeBtn) {
        closeBtn.onclick = null;
    }

    const submitBtn = drawer.querySelector('.submit-plant-comment');
    if (submitBtn) {
        submitBtn.onclick = null;
    }

    const commentInput = drawer.querySelector('.plant-comment-input');
    if (commentInput) {
        commentInput.onkeydown = null;
        commentInput.value = '';
    }
}


// 快速添加评论到列表
function addCommentToList(comment) {
    const container = document.getElementById('plant-comments-container');
    if (!container) return;

    // 检查是否为空状态
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // 创建新评论HTML
    const commentHTML = createCommentHTML(comment);

    // 插入到列表顶部
    const newDiv = document.createElement('div');
    newDiv.innerHTML = commentHTML;
    newDiv.classList.add('comment-item');
    newDiv.style.animation = 'fadeIn 0.3s ease';

    container.insertBefore(newDiv, container.firstChild);
}

// 加载植物评论
async function loadPlantComments(plantId) {
    try {
        const drawer = document.querySelector('.plant-comment-drawer');
        const contentArea = drawer.querySelector('.plant-comment-content');

        if (!contentArea) {
            console.error('评论内容区域未找到');
            return;
        }

        // 显示加载状态
        contentArea.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-spinner fa-spin"></i>
                <p class="text-gray-500 mt-2">加载评论中...</p>
            </div>
        `;

        // 从Supabase获取评论
        const {data: comments, error} = await supabase
            .from('plant_comments')
            .select(`
                *,
                users:user_id (
                    username,
                    full_name,
                    avatar
                )
            `)
            .eq('plant_id', plantId)
            .order('created_at', {ascending: false});

        if (error) throw error;

        // 存储评论数据
        plantComments[plantId] = comments || [];

        // 更新评论数量显示
        updateCommentCountDisplay(plantId, comments?.length || 0);
        PlantState.updatePlantInteraction(plantId, 'comment', comments?.length || 0);

        // 渲染评论
        renderPlantComments(plantId, comments);

    } catch (error) {
        console.error('加载评论失败:', error);
        const contentArea = document.querySelector('.plant-comment-content');
        if (contentArea) {
            contentArea.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-exclamation-triangle"></i>
                    <h3 class="text-lg font-medium mb-2">加载失败</h3>
                    <p class="text-gray-500">无法加载评论，请稍后重试</p>
                </div>
            `;
        }
    }
}

// 更新评论计数显示
function updateCommentCountDisplay(plantId, count) {
    // 更新评论按钮的计数显示
    document.querySelectorAll(`.plant-action-btn.comment[data-plant-id="${plantId}"] .comment-count`).forEach(span => {
        span.textContent = count;
    });
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
        return '刚刚';
    } else if (diffMin < 60) {
        return `${diffMin}分钟前`;
    } else if (diffHour < 24) {
        return `${diffHour}小时前`;
    } else if (diffDay < 7) {
        return `${diffDay}天前`;
    } else {
        return date.toLocaleDateString();
    }
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 渲染植物评论
function renderPlantComments(plantId, comments) {
    const contentArea = document.querySelector('.plant-comment-content');
    if (!contentArea) return;

    if (!comments || comments.length === 0) {
        contentArea.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-comments"></i>
                <h3 class="text-lg font-medium mb-2">暂无评论</h3>
                <p class="text-gray-500">快来发表第一条评论吧！</p>
            </div>
        `;
        return;
    }

    let html = '<div class="comments-list">';

    comments.forEach(comment => {
        const isOwn = comment.user_id === userData.id;
        const commentDate = new Date(comment.created_at);
        const timeAgo = formatTimeAgo(commentDate);

        html += `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="flex items-start gap-3 mb-2">
                    <div class="comment-avatar">
                        ${comment.users?.avatar ?
            `<img src="${comment.users.avatar}" alt="${comment.users.full_name}" class="w-8 h-8 rounded-full">` :
            `<i class="fa fa-user text-gray-400"></i>`
        }
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="font-medium text-sm">${comment.users?.full_name || comment.users?.username || '匿名用户'}</div>
                                <div class="text-xs text-gray-500">${timeAgo}</div>
                            </div>
                            ${isOwn ? `
                                <button class="delete-comment-btn text-xs" data-comment-id="${comment.id}">
                                    <i class="fa fa-trash"></i> 删除
                                </button>
                            ` : ''}
                        </div>
                        <div class="mt-2 text-sm text-gray-700">${escapeHtml(comment.content)}</div>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    contentArea.innerHTML = html;

    // 绑定删除按钮事件
    contentArea.querySelectorAll('.delete-comment-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
            const commentId = this.getAttribute('data-comment-id');
            if (confirm('确定要删除这条评论吗？')) {
                await deletePlantCommentById(commentId, plantId);
            }
        });
    });
}

// 创建评论HTML
function createCommentHTML(comment) {
    if (!comment) return '';

    let authorName, avatar;

    if (comment.users) {
        authorName = comment.users.full_name || comment.users.username || comment.username || '匿名用户';
        avatar = comment.users.avatar;
    } else {
        authorName = comment.username || '匿名用户';
        avatar = null;

        if (comment.username === PlantState.currentUser) {
            const userAvatar = localStorage.getItem('userAvatar');
            if (userAvatar) avatar = userAvatar;
        }
    }

    // 格式化时间
    const commentDate = new Date(comment.created_at);
    const now = new Date();
    const diffHours = Math.floor((now - commentDate) / (1000 * 60 * 60));

    let timeStr;
    if (diffHours < 1) {
        timeStr = '刚刚';
    } else if (diffHours < 24) {
        timeStr = `${diffHours}小时前`;
    } else {
        timeStr = commentDate.toLocaleDateString('zh-CN');
    }

    return `
        <div class="comment-item" data-comment-id="${comment.id}">
            <div class="flex items-start gap-3">
                <div class="comment-avatar flex-shrink-0">
                    ${avatar ?
        `<img src="${avatar}" alt="${authorName}" class="w-10 h-10 rounded-full object-cover" onerror="this.onerror=null; this.src='img/default.png';">` :
        `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                            ${authorName.charAt(0).toUpperCase()}
                        </div>`
    }
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex items-center">
                            <span class="font-medium text-gray-800 mr-2">${authorName}</span>
                            <span class="text-gray-500 text-sm">${timeStr}</span>
                        </div>
                        ${comment.username === PlantState.currentUser ? `
                            <button class="delete-comment-btn"
                                    data-comment-id="${comment.id}"
                                    title="删除评论">
                                <i class="fa fa-trash mr-1"></i>删除
                            </button>
                        ` : ''}
                    </div>
                    <div class="text-gray-700 mb-3 whitespace-pre-wrap break-words">${comment.content || ''}</div>
                    <div class="flex items-center gap-4 text-sm">
                        <button class="reply-comment-btn"
                                data-author="${authorName}">
                            <i class="fa fa-reply mr-1"></i>回复
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 提交植物评论
async function submitPlantComment(plantId) {
    const drawer = document.querySelector('.plant-comment-drawer');
    const commentInput = drawer.querySelector('.plant-comment-input');
    const submitBtn = drawer.querySelector('.submit-plant-comment');

    if (!commentInput || !submitBtn) return;

    const content = commentInput.value.trim();
    if (!content) {
        alert('评论内容不能为空');
        return;
    }

    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert('请先登录才能评论');
        return;
    }

    // 禁用提交按钮
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> 提交中...';

    try {
        // 提交到数据库
        const commentData = {
            plant_id: currentCommentPlantId,
            username: PlantState.currentUser,
            content: content,
            created_at: new Date().toISOString()
        };
        // 提交评论到Supabase
        const {data: newComment, error} = await supabase
            .from('plant_comments')
            .insert([{
                plant_id: plantId,
                user_id: userData.id,
                username: userData.username,
                content: content,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select(`
                *,
                users:user_id (
                    username,
                    full_name,
                    avatar
                )
            `);

        if (error) throw error;

        // 清空输入框
        commentInput.value = '';

        // 重新加载评论
        await loadPlantComments(plantId);

        const plant = worksData.find(p => p.id == plantId);
        if (plant && plant.created_by !== currentUser) {
            await createCommentNotification(plantId, plant.name, currentUser, userData.full_name || currentUser);
        }

        showSuccessMessage('评论发表成功！');

    } catch (error) {
        console.error('提交评论失败:', error);
        alert('评论发表失败，请稍后重试');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '发表评论';
    }
}
// 删除植物评论
async function deletePlantCommentById(commentId, plantId) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            alert('请先登录');
            return;
        }

        // 获取评论信息以验证权限
        const {data: comment, error: fetchError} = await supabase
            .from('plant_comments')
            .select('user_id, plant_id')
            .eq('id', commentId)
            .single();

        if (fetchError) throw fetchError;

        // 验证用户是否有权限删除
        const {data: currentUserData, error: userError} = await supabase
            .from('users')
            .select('id')
            .eq('username', currentUser)
            .single();

        if (userError) throw userError;

        if (comment.user_id !== currentUserData.id) {
            alert('没有权限删除此评论');
            return;
        }

        // 删除评论
        const {error} = await supabase
            .from('plant_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        // 重新加载评论
        await loadPlantComments(plantId);

        // 更新评论计数
        updatePlantInteractionCounts();

        showSuccessMessage('评论删除成功');

    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除评论失败，请稍后重试');
    }
}

// 更新植物互动计数显示
async function updatePlantInteractionCounts() {
    try {
        const currentUser = localStorage.getItem('currentUser');

        // 遍历所有植物卡片
        document.querySelectorAll('.plant-action-btn').forEach(async (btn) => {
            const plantId = btn.getAttribute('data-plant-id');
            if (!plantId) return;

            if (btn.classList.contains('like')) {
                // 获取点赞数量
                const likeCount = await getPlantLikeCount(plantId);
                const countSpan = btn.querySelector('.like-count');
                if (countSpan) {
                    countSpan.textContent = likeCount;
                }

                // 设置活跃状态
                const isLiked = await checkIfUserLikedPlant(plantId, currentUser);
                if (isLiked) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            } else if (btn.classList.contains('favorite')) {
                // 获取收藏数量
                const favoriteCount = await getPlantFavoriteCount(plantId);
                const countSpan = btn.querySelector('.favorite-count');
                if (countSpan) {
                    countSpan.textContent = favoriteCount;
                }

                // 设置活跃状态
                const isFavorited = await checkIfUserFavoritedPlant(plantId, currentUser);
                if (isFavorited) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            } else if (btn.classList.contains('comment')) {
                // 获取评论数量
                const commentCount = await getPlantCommentCount(plantId);
                const countSpan = btn.querySelector('.comment-count');
                if (countSpan) {
                    countSpan.textContent = commentCount;
                }
            }
        });

    } catch (error) {
        console.error('更新植物互动计数失败:', error);
    }
}

// 获取植物的点赞数量
async function getPlantLikeCount(plantId) {
    try {
        const {count, error} = await supabase
            .from('plant_likes')
            .select('*', {count: 'exact', head: true})
            .eq('plant_id', plantId);

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('获取点赞数量失败:', error);
        return 0;
    }
}

// 获取植物的收藏数量
async function getPlantFavoriteCount(plantId) {
    try {
        const {count, error} = await supabase
            .from('plant_favorites')
            .select('*', {count: 'exact', head: true})
            .eq('plant_id', plantId);

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('获取收藏数量失败:', error);
        return 0;
    }
}

// 获取植物的评论数量
async function getPlantCommentCount(plantId) {
    try {
        const {count, error} = await supabase
            .from('plant_comments')
            .select('*', {count: 'exact', head: true})
            .eq('plant_id', plantId);

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('获取评论数量失败:', error);
        return 0;
    }
}

// 检查用户是否点赞了植物
async function checkIfUserLikedPlant(plantId, username) {
    if (!username) return false;

    try {
        const {data, error} = await supabase
            .from('plant_likes')
            .select('id')
            .eq('plant_id', plantId)
            .eq('username', username)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('检查点赞状态失败:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error('检查点赞状态失败:', error);
        return false;
    }
}

// 检查用户是否收藏了植物
async function checkIfUserFavoritedPlant(plantId, username) {
    if (!username) return false;

    try {
        const {data, error} = await supabase
            .from('plant_favorites')
            .select('id')
            .eq('plant_id', plantId)
            .eq('username', username)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('检查收藏状态失败:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error('检查收藏状态失败:', error);
        return false;
    }
}

// 删除评论
async function deletePlantComment(commentId) {
    if (!commentId) return;

    if (!confirm('确定要删除这条评论吗？删除后无法恢复。')) {
        return;
    }

    if (!PlantState.currentUser) {
        alert('请先登录');
        return;
    }

    console.log('删除评论，评论ID:', commentId, '当前植物ID:', currentCommentPlantId);

    try {
        // 检查权限
        const {data: comment, error: fetchError} = await supabase
            .from('plant_comments')
            .select('username, plant_id')
            .eq('id', commentId)
            .single();

        if (fetchError) {
            console.error('检查评论权限错误:', fetchError);
            throw fetchError;
        }

        if (!comment) {
            alert('评论不存在');
            return;
        }

        // if (comment.username !== PlantState.currentUser) {
        //     alert('只能删除自己的评论');
        //     return;
        // }

        // 删除评论
        const {error} = await supabase
            .from('plant_comments')
            .delete()
            .eq('id', commentId);

        if (error) {
            console.error('删除评论错误:', error);
            throw error;
        }

        console.log('评论删除成功，植物ID:', comment.plant_id);

        // 立即更新评论计数
        const oldCount = PlantState.interactions.comments[comment.plant_id] || 0;
        PlantState.updatePlantInteraction(comment.plant_id, 'comment', Math.max(0, oldCount - 1));

        // 从DOM中移除评论项
        const commentItem = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
        if (commentItem) {
            commentItem.remove();
        }

        // 如果评论列表为空，显示空状态
        const container = document.getElementById('plant-comments-container');
        if (container && container.children.length === 0) {
            container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa fa-comments text-gray-300 text-4xl mb-4"></i>
                        <p class="text-gray-500">暂无评论，快来第一个评论吧！</p>
                    </div>
                `;
        }

        showSuccessMessage('评论删除成功！');

    } catch (error) {
        console.error('删除评论失败:', error);
        alert('删除评论失败: ' + (error.message || '请稍后重试！'));
    }
}

window.addEventListener('plantStateUpdated', function () {
    updateAllPlantCards();
});

// 更新所有植物卡片的互动显示
function updateAllPlantCards() {
    document.querySelectorAll('.plant-card').forEach(card => {
        const plantId = card.querySelector('.view-detail-btn')?.getAttribute('data-id');
        if (!plantId) return;

        const interaction = PlantState.getPlantInteraction(plantId);

        // 更新点赞
        const likeBtn = card.querySelector('.plant-action-btn.like');
        if (likeBtn) {
            const likeCountSpan = likeBtn.querySelector('.like-count');
            if (likeCountSpan) {
                likeCountSpan.textContent = interaction.likes;
            }
            if (interaction.isLiked) {
                likeBtn.classList.add('active');
            } else {
                likeBtn.classList.remove('active');
            }
        }

        // 更新收藏
        const favoriteBtn = card.querySelector('.plant-action-btn.favorite');
        if (favoriteBtn) {
            const favoriteCountSpan = favoriteBtn.querySelector('.favorite-count');
            if (favoriteCountSpan) {
                favoriteCountSpan.textContent = interaction.favorites;
            }
            if (interaction.isFavorited) {
                favoriteBtn.classList.add('active');
            } else {
                favoriteBtn.classList.remove('active');
            }
        }

        // 更新评论
        const commentBtn = card.querySelector('.plant-action-btn.comment');
        if (commentBtn) {
            const commentCountSpan = commentBtn.querySelector('.comment-count');
            if (commentCountSpan) {
                commentCountSpan.textContent = interaction.comments;
            }
        }
    });
}

function updatePlantsGrid() {
    const plantsGrid = document.getElementById('plantsGrid');
    plantsGrid.innerHTML = '';

    const plantIds = Object.keys(PlantState.plants).sort((a, b) => parseInt(a) - parseInt(b));
    const displayIds = plantIds.slice(0, plantsDisplayLimit);

    displayIds.forEach(id => {
        const plant = PlantState.plants[id];
        const interaction = PlantState.getPlantInteraction(id);

        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl overflow-hidden shadow-sm card-hover group plant-card';
        card.setAttribute('data-type', plant.category);
        card.setAttribute('data-name', plant.name);
        card.setAttribute('data-family', plant.family);
        card.setAttribute('data-scientific', plant.scientific);

        card.innerHTML = `
        <!-- 植物卡片图片部分 -->
        ${generatePlantCardImage(plant)}
        <div class="p-5">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="text-lg font-semibold plant-name">${plant.name}</h3>
                    <span class="text-xs text-gray-500">${plant.scientific}</span>
                </div>
            </div>
            <p class="text-gray-600 text-sm mb-4 line-clamp-2 plant-description">${plant.description}</p>
            <div class="flex justify-between items-center">
                <span class="text-xs text-gray-500"><i class="fa fa-map-marker mr-1"></i> ${plant.distribution}</span>
                <span class="text-xs text-gray-500"><i class="fa fa-user mr-1"></i> ${plant.createdBy || '未知'}</span>
                <button class="view-detail-btn text-primary hover:text-primary/80 text-sm font-medium" data-id="${id}">查看详情</button>
            </div>
        </div>
        <!-- 点赞收藏评论区域 -->
        <div class="plant-actions">
            <div class="plant-action-btn like" data-plant-id="${id}">
                <i class="fa fa-heart"></i>
                <span class="like-count">${interaction.likes}</span>
            </div>
            <div class="plant-action-btn favorite" data-plant-id="${id}">
                <i class="fa fa-bookmark"></i>
                <span class="favorite-count">${interaction.favorites}</span>
            </div>
            <div class="plant-action-btn comment" data-plant-id="${id}">
                <i class="fa fa-comment"></i>
                <span class="comment-count">${interaction.comments}</span>
            </div>
        </div>
        `;

        plantsGrid.appendChild(card);
    });

    // 为"查看详情"按钮添加事件
    document.querySelectorAll('.view-detail-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const plantId = this.getAttribute('data-id');
            showPlantDetails(plantId);
        });
    });

    // 初始化互动按钮事件
    initInteractionButtons();

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (plantsDisplayLimit >= Object.keys(PlantState.plants).length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'inline-flex';
    }

    filterPlants(currentSearch, currentFilter);
}

// 初始化互动按钮事件
function initInteractionButtons() {
    // 点赞按钮事件
    document.querySelectorAll('.plant-action-btn.like').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const plantId = this.getAttribute('data-plant-id');
            handleLike(plantId, this);
        });
    });

    // 收藏按钮事件
    document.querySelectorAll('.plant-action-btn.favorite').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const plantId = this.getAttribute('data-plant-id');
            handleFavorite(plantId, this);
        });
    });

    // 评论按钮事件
    document.querySelectorAll('.plant-action-btn.comment').forEach(btn => {
        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();
            const plantId = this.getAttribute('data-plant-id');

            // 检查是否登录
            if (!PlantState.currentUser) {
                alert('请先登录才能评论！');
                window.location.href = 'login.html';
                return;
            }

            await openPlantCommentDrawer(plantId);
        });
    });
}

let currentFilter = 'all';
let currentSearch = '';
let plantsDisplayLimit = 6;
let plantChart = null;

// 显示成功消息
function showSuccessMessage(message) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message show';
    successMessage.innerHTML = `
            <i class="fa fa-check-circle mr-2"></i>
            <span>${message}</span>
        `;

    document.body.appendChild(successMessage);

    // 3秒后自动移除
    setTimeout(() => {
        successMessage.classList.remove('show');
        setTimeout(() => {
            successMessage.remove();
        }, 300);
    }, 3000);
}


/**
 * 获取图片URL（支持Base64和普通URL）
 * @param {string|Array} imageData - 图片数据（Base64字符串、URL或数组）
 * @returns {string} 处理后的图片URL
 */
function getImageUrl(imageData) {
    if (!imageData) {
        return 'img/default.png';
    }

    // 如果是 Base64 数据，直接返回
    if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
        return imageData;
    }

    if (typeof imageData === 'string' &&
        (imageData.startsWith('http://') || imageData.startsWith('https://'))) {
        return imageData;
    }

    if (typeof imageData === 'string' && imageData.includes('.')) {
        return imageData.startsWith('img/') ? imageData : `img/${imageData}`;
    }

    return 'img/default.png';
}

/**
 * 处理从Supabase获取的植物图片数据
 * @param {Object} plant - 植物数据对象
 * @returns {Array} 处理后的图片数组
 */
function processPlantImages(plant) {
    let images = [];

    if (plant.images && typeof plant.images === 'string') {
        try {
            const parsedImages = JSON.parse(plant.images);
            if (Array.isArray(parsedImages)) {
                images = parsedImages;
            }
        } catch (e) {
            if (plant.images.startsWith('data:image/')) {
                images = [plant.images];
            }
        }
    }

    else if (Array.isArray(plant.images)) {
        images = plant.images;
    }

    else if (plant.image_url && typeof plant.image_url === 'string') {
        try {
            const parsedImageUrl = JSON.parse(plant.image_url);
            if (Array.isArray(parsedImageUrl)) {
                images = parsedImageUrl;
            } else if (parsedImageUrl && typeof parsedImageUrl === 'string') {
                images = [parsedImageUrl];
            }
        } catch (e) {
            if (plant.image_url.startsWith('data:image/')) {
                images = [plant.image_url];
            }
        }
    }

    console.log(`解析后的图片数据:`, images);

    if (images.length === 0) {
        images = ['img/default.png'];
    }

    return images;
}

/**
 * 更新植物详情页的更多照片区域
 * @param {Object} plant - 植物数据对象
 */
function updateMorePhotosSection(plant) {
    const morePhotosSection = document.getElementById('more-photos-section');
    const morePhotosGrid = document.getElementById('more-photos-grid');

    morePhotosGrid.innerHTML = '';

    if (plant.images && plant.images.length > 1) {
        morePhotosSection.style.display = 'block';

        for (let i = 1; i < plant.images.length; i++) {
            const photoItem = document.createElement('div');
            photoItem.className = 'more-photo-item';

            const img = document.createElement('img');

            let imageSrc = plant.images[i];
            if (typeof imageSrc === 'string' && imageSrc.startsWith('data:image/')) {
                img.src = imageSrc;
            } else {
                img.src = getImageUrl(imageSrc);
            }

            img.alt = `${plant.name} - 照片 ${i + 1}`;
            img.className = 'more-photo-img';

            img.onerror = function () {
                this.onerror = null;
                this.src = 'img/default.png';
            };

            img.addEventListener('click', function () {
                const clickedImage = plant.images[i];
                const previewImage = typeof clickedImage === 'string' && clickedImage.startsWith('data:image/')
                    ? clickedImage
                    : getImageUrl(clickedImage);
                openDetailImagePreview(previewImage);
            });

            photoItem.appendChild(img);
            morePhotosGrid.appendChild(photoItem);
        }
    } else {
        morePhotosSection.style.display = 'none';
    }
}

/**
 * 为植物卡片生成图片HTML
 * @param {Object} plant - 植物数据对象
 * @returns {string} 图片HTML字符串
 */
function generatePlantCardImage(plant) {
    let cardImage = 'img/default.png';

    if (plant.images && plant.images.length > 0) {
        const firstImage = plant.images[0];
        if (typeof firstImage === 'string' && firstImage.startsWith('data:image/')) {
            cardImage = firstImage;
        } else {
            cardImage = getImageUrl(firstImage);
        }
    }

    return `
        <div class="relative h-56 overflow-hidden">
            <img src="${cardImage}" alt="${plant.name}"
                 class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                 onerror="this.onerror=null; this.src='img/default.png';">
            <div class="absolute top-3 right-3 bg-white/80 backdrop-blur-sm text-primary text-xs font-medium px-2 py-1 rounded plant-type">
                ${plant.category}
            </div>
        </div>
    `;
}

/**
 * 为植物详情页生成主图片
 * @param {Object} plant - 植物数据对象
 * @returns {string} 主图片URL
 */
function generateDetailMainImage(plant) {
    let mainImage = 'img/default.png';
    if (plant.images && plant.images.length > 0) {
        const firstImage = plant.images[0];
        if (typeof firstImage === 'string' && firstImage.startsWith('data:image/')) {
            mainImage = firstImage;
        } else {
            mainImage = getImageUrl(firstImage);
        }
    }
    return mainImage;
}

/**
 * 收集轮播图图片
 * @returns {Array} 轮播图图片数组
 */
function collectCarouselImages() {
    let plantImages = [];
    Object.values(PlantState.plants).forEach(plant => {
        if (plant.images && Array.isArray(plant.images)) {
            plant.images.forEach(img => {
                if (img) {
                    if (typeof img === 'string' && img.startsWith('data:image/')) {
                        plantImages.push(img);
                    } else {
                        const imageUrl = getImageUrl(img);
                        if (imageUrl && imageUrl !== 'img/default.png') {
                            plantImages.push(imageUrl);
                        }
                    }
                }
            });
        }
    });

    console.log('轮播图收集到的图片:', plantImages.length);
    if (plantImages.length < 5) {
        console.log('植物图片不足，补充默认图片');
        Object.values(PlantState.plants).forEach(plant => {
            if (plant.images && plant.images.length > 0 && plantImages.length < 5) {
                const firstImage = plant.images[0];
                if (typeof firstImage === 'string' && firstImage.startsWith('data:image/')) {
                    plantImages.push(firstImage);
                } else {
                    const imageUrl = getImageUrl(firstImage);
                    if (imageUrl && !plantImages.includes(imageUrl)) {
                        plantImages.push(imageUrl);
                    }
                }
            }
        });
    }

    return plantImages.slice(0, 5);
}

// 从数据库获取植物数据
async function fetchPlantsFromSupabase() {
    try {
        const {data: plants, error} = await supabase
            .from('plants')
            .select('*')
            .order('id', {ascending: true});

        if (error) throw error;

        console.log('从数据库获取的植物数据:', plants.length);

        const formattedData = {};
        plants.forEach(plant => {
            const images = processPlantImages(plant);
            // 修改这里的坐标处理逻辑
            let mapPosition = {lng: 119.053194, lat: 33.558272}; // 默认坐标

            if (plant.map_position && typeof plant.map_position === 'string') {
                try {
                    const parsedPos = JSON.parse(plant.map_position);
                    if (parsedPos && typeof parsedPos.lng === 'number' && typeof parsedPos.lat === 'number') {
                        mapPosition = {
                            lng: parsedPos.lng,
                            lat: parsedPos.lat
                        };
                    }
                } catch (e) {
                    console.warn(`植物 ${plant.id} 的坐标解析失败:`, e);
                }
            } else if (plant.map_position && typeof plant.map_position === 'object') {
                if (plant.map_position.lng && plant.map_position.lat) {
                    mapPosition = {
                        lng: parseFloat(plant.map_position.lng),
                        lat: parseFloat(plant.map_position.lat)
                    };
                }
            }

            // 如果有经纬度字段，优先使用
            if (plant.longitude && plant.latitude) {
                mapPosition = {
                    lng: parseFloat(plant.longitude),
                    lat: parseFloat(plant.latitude)
                };
            }

            formattedData[plant.id] = {
                id: plant.id,
                name: plant.name,
                scientific: plant.scientific_name,
                family: plant.family,
                genus: plant.genus,
                distribution: plant.location,
                environment: plant.environment,
                description: plant.description,
                images: images,
                collectionDate: plant.collection_date,
                category: plant.category,
                location: plant.location,
                mapPosition: mapPosition,
                createdBy: plant.created_by,
                created_at: plant.created_at
            };
        });

        return formattedData;
    } catch (error) {
        console.error('获取植物数据失败:', error);
        return {};
    }
}

// 显示植物详情
function showPlantDetails(plantId) {
    const plant = PlantState.plants[plantId];
    const mainImage = generateDetailMainImage(plant);
    document.getElementById('detail-title').textContent = plant.name;
    document.getElementById('detail-subtitle').textContent = plant.scientific;
    document.getElementById('info-family').textContent = plant.family;
    document.getElementById('info-genus').textContent = plant.genus;
    document.getElementById('info-distribution').textContent = plant.distribution;
    document.getElementById('info-environment').textContent = plant.environment;
    document.getElementById('info-collection-date').textContent = plant.collectionDate;
    document.getElementById('info-created-by').textContent = plant.createdBy || '未知';

    const detailImage = document.getElementById('detail-image');
    detailImage.src = mainImage;
    detailImage.alt = plant.name;

    detailImage.onerror = function () {
        console.error('详情图片加载失败:', this.src);
        this.onerror = null;
        this.src = 'img/default.png';
    };

    document.getElementById('info-description').textContent = plant.description;

    updateMorePhotosSection(plant);

    document.getElementById('specimen-detail').classList.add('active');
    document.body.style.overflow = 'hidden';

    updateMiniMap(plant);
}

async function initApp() {
    console.log('开始初始化应用...');
    updateHeaderAvatar();
    await loadUserAvatarFromDB();
    if (Object.keys(PlantState.plants).length === 0) {
        await loadPlantData();
    }

    console.log('植物数据检查:');
    Object.keys(PlantState.plants).forEach(id => {
        const plant = PlantState.plants[id];
        console.log(`植物 ${plant.name}:`, {
            图片数量: plant.images ? plant.images.length : 0,
            图片数据: plant.images ? plant.images.slice(0, 2) : '无',
            处理后的URL: plant.images && plant.images.length > 0 ? getImageUrl(plant.images[0]) : '无'
        });
    });

    updatePlantsGrid();
    updatePlantStatistics(calculatePlantCounts());
    setupDetailImagePreview();
    setupQrcodePreview();
    initCarousel();
    if (typeof favoritesData === 'undefined') {
        favoritesData = [];
    }
    updateTopLocations();
    updateSeasonalPlants();

    // 延迟初始化主地图
    setTimeout(() => {
        initBaiduMap();
    }, 1000);

    console.log('应用初始化完成');
}

function initBaiduMap() {
    const mapContainer = document.getElementById('baidu-map-container');
    if (!mapContainer) {
        console.error('地图容器未找到');
        return;
    }

    if (map) {
        console.log('地图已经初始化');
        return;
    }

    console.log('开始初始化百度地图...');

    try {
        map = new BMap.Map("baidu-map-container");
        const point = new BMap.Point(119.053194, 33.558272);

        map.centerAndZoom(point, 17);
        map.enableScrollWheelZoom(true);

        map.addControl(new BMap.MapTypeControl({
            mapTypes: [BMAP_NORMAL_MAP, BMAP_HYBRID_MAP]
        }));

        map.addControl(new BMap.NavigationControl({
            type: BMAP_NAVIGATION_CONTROL_ZOOM,
            anchor: BMAP_ANCHOR_TOP_LEFT
        }));

        map.addControl(new BMap.ScaleControl({
            anchor: BMAP_ANCHOR_BOTTOM_LEFT
        }));

        map.addControl(new BMap.OverviewMapControl({
            anchor: BMAP_ANCHOR_BOTTOM_RIGHT,
            isOpen: false
        }));

        map.addEventListener("tilesloaded", function () {
            console.log("地图加载完成，当前中心点:", map.getCenter().lng, map.getCenter().lat);
            updateBaiduMapMarkers();
        });

        console.log("百度地图初始化完成");
    } catch (error) {
        console.error("地图初始化失败:", error);
        setTimeout(() => {
            initBaiduMap();
        }, 1000);
    }
}

// 更新百度地图标记
function updateBaiduMapMarkers(filter = 'all') {
    if (!map) {
        console.error('地图未初始化，无法更新标记');
        return;
    }

    map.clearOverlays();
    markers = [];

    Object.keys(PlantState.plants).forEach(id => {
        const plant = PlantState.plants[id];

        if (filter !== 'all' && plant.category !== filter) {
            return;
        }

        const point = new BMap.Point(plant.mapPosition.lng, plant.mapPosition.lat);
        const marker = createCustomMarker(point, plant.category);
        map.addOverlay(marker);

        const infoWindow = new BMap.InfoWindow(`
                <div class="baidu-info-window">
                    <div class="baidu-info-window-content">
                        <div class="baidu-info-window-text">
                            <h3>${plant.name}</h3>
                            <p><strong>位置:</strong> ${plant.location}</p>
                            <p><strong>类别:</strong> ${plant.category}</p>
                            <p><strong>添加者:</strong> ${plant.createdBy || '未知'}</p>
                            <button onclick="showPlantDetails(${id})">查看详情</button>
                        </div>
                        <img src="${plant.images[0] || 'img/default.png'}" alt="${plant.name}" class="baidu-info-window-image">
                    </div>
                </div>
            `, {
            width: 280,
            height: 150,
            offset: new BMap.Size(0, -30)
        });

        marker.addEventListener("click", function () {
            map.closeInfoWindow();
            map.openInfoWindow(infoWindow, point);
        });

        let hoverTimer = null;
        let hideTimer = null;

        marker.addEventListener("mouseover", function () {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }

            hoverTimer = setTimeout(() => {
                map.closeInfoWindow();
                map.openInfoWindow(infoWindow, point);
                hoverInfoWindow = infoWindow;
                hoverTimer = null;
            }, 100);
        });

        marker.addEventListener("mouseout", function () {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }

            hideTimer = setTimeout(() => {
                if (hoverInfoWindow === infoWindow) {
                    map.closeInfoWindow();
                    hoverInfoWindow = null;
                }
                hideTimer = null;
            }, 2000);
        });

        marker.addEventListener("mousemove", function () {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
        });

        markers.push(marker);
    });
}

// 创建自定义标记
function createCustomMarker(point, category) {
    const marker = new BMap.Marker(point, {});

    let markerClass = 'baidu-marker-tree';
    let iconClass = 'fa-tree';

    switch (category) {
        case '灌木':
            markerClass = 'baidu-marker-shrub';
            iconClass = 'fa-pagelines';
            break;
        case '草本':
            markerClass = 'baidu-marker-herb';
            iconClass = 'fa-leaf';
            break;
        case '藤本':
            markerClass = 'baidu-marker-vine';
            iconClass = 'fa-vine';
            break;
        case '蕨类':
            markerClass = 'baidu-marker-fern';
            iconClass = 'fa-pagelines';
            break;
    }

    marker.setLabel(new BMap.Label(`<div class="baidu-marker ${markerClass}"><i class="fa ${iconClass}"></i></div>`, {
        offset: new BMap.Size(-12, -12)
    }));

    return marker;
}

// 地图植物筛选按钮
const mapFilterButtons = document.querySelectorAll('.filter-map-btn');

mapFilterButtons.forEach(button => {
    button.addEventListener('click', function () {
        mapFilterButtons.forEach(btn => {
            btn.classList.remove('bg-primary', 'text-white');
            btn.classList.add('bg-gray-100', 'hover:bg-gray-200');
        });

        this.classList.remove('bg-gray-100', 'hover:bg-gray-200');
        this.classList.add('bg-primary', 'text-white');
        currentSearch = '';
        const searchInputs = [
            modalSearchInput,
            mobileSearchInput,
            plantSearchInput
        ];

        searchInputs.forEach(input => {
            if (input) input.value = '';
        });

        const filter = this.getAttribute('data-filter');
        updateBaiduMapMarkers(filter);

        const legendItems = document.querySelectorAll('#map-legend > div');
        legendItems.forEach(item => {
            const typeText = item.querySelector('span').textContent;
            const iconDiv = item.querySelector('div');

            iconDiv.className = 'w-4 h-4 rounded-full mr-2';

            if (filter === 'all') {
                switch (typeText) {
                    case '乔木':
                        iconDiv.classList.add('bg-primary');
                        break;
                    case '灌木':
                        iconDiv.classList.add('bg-secondary');
                        break;
                    case '草本':
                        iconDiv.classList.add('bg-accent');
                        break;
                    case '藤本':
                        iconDiv.classList.add('bg-yellow-500');
                        break;
                    case '蕨类':
                        iconDiv.classList.add('bg-purple-500');
                        break;
                }
            } else {
                if (typeText === filter) {
                    switch (typeText) {
                        case '乔木':
                            iconDiv.classList.add('bg-primary', 'ring-2', 'ring-primary/50');
                            break;
                        case '灌木':
                            iconDiv.classList.add('bg-secondary', 'ring-2', 'ring-secondary/50');
                            break;
                        case '草本':
                            iconDiv.classList.add('bg-accent', 'ring-2', 'ring-accent/50');
                            break;
                        case '藤本':
                            iconDiv.classList.add('bg-yellow-500', 'ring-2', 'ring-yellow-500/50');
                            break;
                        case '蕨类':
                            iconDiv.classList.add('bg-purple-500', 'ring-2', 'ring-purple-500/50');
                            break;
                    }
                } else {
                    switch (typeText) {
                        case '乔木':
                            iconDiv.classList.add('bg-primary');
                            break;
                        case '灌木':
                            iconDiv.classList.add('bg-secondary');
                            break;
                        case '草本':
                            iconDiv.classList.add('bg-accent');
                            break;
                        case '藤本':
                            iconDiv.classList.add('bg-yellow-500');
                            break;
                        case '蕨类':
                            iconDiv.classList.add('bg-purple-500');
                            break;
                    }
                }
            }
        });
    });
});

// 更新详情页小地图
function updateMiniMap(plant) {
    if (currentMiniMap) {
        try {
            currentMiniMap.destroy();
            currentMiniMap = null;
        } catch (e) {
            console.warn("清理小地图时出现警告:", e);
        }
    }

    const miniMapContainer = document.getElementById("mini-map");
    if (!miniMapContainer) return;

    miniMapContainer.innerHTML = '';

    const mapId = `mini-map-${Date.now()}`;
    const mapDiv = document.createElement('div');
    mapDiv.id = mapId;
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    miniMapContainer.appendChild(mapDiv);

    setTimeout(() => {
        try {
            currentMiniMap = new BMap.Map(mapId);
            const point = new BMap.Point(plant.mapPosition.lng, plant.mapPosition.lat);
            currentMiniMap.centerAndZoom(point, 17);

            currentMiniMap.disableScrollWheelZoom();
            currentMiniMap.disableDoubleClickZoom();
            currentMiniMap.enableInertialDragging(false);
            currentMiniMap.enableContinuousZoom(false);
            currentMiniMap.disableDragging();

            currentMiniMap.addControl(new BMap.NavigationControl({
                type: BMAP_NAVIGATION_CONTROL_SMALL,
                anchor: BMAP_ANCHOR_TOP_LEFT
            }));

            const marker = new BMap.Marker(point);
            currentMiniMap.addOverlay(marker);

            const infoWindow = new BMap.InfoWindow(`
                    <div style="padding:10px;max-width:200px;">
                        <h4 style="margin:0 0 5px 0;color:#2E7D32;">${plant.name}</h4>
                        <p style="margin:0;font-size:12px;color:#666;">位置: ${plant.location}</p>
                        <p style="margin:0;font-size:12px;color:#666;">类别: ${plant.category}</p>
                        <p style="margin:0;font-size:12px;color:#666;">添加者: ${plant.createdBy || '未知'}</p>
                    </div>
                `);

            marker.addEventListener("click", function () {
                currentMiniMap.openInfoWindow(infoWindow, point);
            });

            setTimeout(() => {
                currentMiniMap.checkResize();
            }, 50);

        } catch (error) {
            console.error("小地图初始化失败:", error);
        }
    }, 100);
}
// 用户头像点击事件
document.getElementById('userAvatar').addEventListener('click', function () {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentUser = localStorage.getItem('currentUser');
    const userRole = localStorage.getItem('userRole');

    if (isLoggedIn === 'true' && currentUser) {
        showUserMenu(currentUser, userRole);
    } else {
        window.location.href = 'login.html';
    }
});

// 更新主页头像显示
function updateHeaderAvatar() {
    const headerAvatar = document.getElementById('headerAvatar');
    const userAvatar = localStorage.getItem('userAvatar');
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentUser = localStorage.getItem('currentUser');

    headerAvatar.innerHTML = '';

    if (isLoggedIn === 'true' && currentUser) {
        if (userAvatar && userAvatar !== 'null' && userAvatar !== 'undefined') {
            const img = document.createElement('img');
            img.src = userAvatar;
            img.className = 'w-full h-full object-cover rounded-full';
            img.alt = '用户头像';
            headerAvatar.className = 'w-8 h-8 rounded-full overflow-hidden border border-white/30';
            headerAvatar.appendChild(img);
        } else {
            headerAvatar.className = 'default-avatar';
            let displayText = currentUser.charAt(0).toUpperCase();
            if (/[\u4e00-\u9fa5]/.test(currentUser)) {
                displayText = currentUser.charAt(0);
            }

            headerAvatar.innerHTML = displayText;
        }
    } else {
        headerAvatar.className = 'default-avatar';
        headerAvatar.innerHTML = '登录';
    }
}

// 在主页初始化时从数据库加载头像
async function loadUserAvatarFromDB() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;

        const {data: user, error} = await supabase
            .from('users')
            .select('avatar')
            .eq('username', currentUser)
            .single();

        if (error) throw error;

        if (user && user.avatar) {
            localStorage.setItem('userAvatar', user.avatar);
            updateHeaderAvatar();
        }
    } catch (error) {
        console.error('加载用户头像失败:', error);
    }
}

// 显示用户菜单函数
function showUserMenu(username, role) {
    const displayRole = (username === 'admin' && role === 'admin') ? 'super-admin' : role;

    const menuHtml = `
            <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                <div class="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
                    <h3 class="text-lg font-semibold mb-4">用户信息</h3>
                    <p class="mb-2">欢迎，${username}！</p>
                    <p class="mb-4 text-sm text-gray-600">角色：${displayRole === 'super-admin' ? '超级管理员' : (displayRole === 'admin' ? '管理员' : '普通用户')}</p>
                    <div class="flex flex-col gap-2">
                        <button onclick="openProfilePage()" class="w-full bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center">
                            <i class="fa fa-user mr-2"></i> 个人信息
                        </button>
                        <div class="flex gap-2">
                            <button onclick="logout()" class="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-colors">
                                退出登录
                            </button>
                            <button onclick="closeUserMenu()" class="flex-1 bg-gray-300 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    const menuDiv = document.createElement('div');
    menuDiv.innerHTML = menuHtml;
    menuDiv.id = 'userMenuModal';
    document.body.appendChild(menuDiv);
}

function openProfilePage() {
    closeUserMenu();
    window.location.href = 'my.html';
}

// 关闭用户菜单
function closeUserMenu() {
    const menu = document.getElementById('userMenuModal');
    if (menu) {
        menu.remove();
    }
}

// 退出登录
function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userAvatar');
    PlantState.currentUser = '';
    closeUserMenu();
    updateHeaderAvatar();
    alert('已退出登录');
    location.reload();
}

//轮播
const carouselConfig = {
    interval: 5000,
    currentSlide: 0
};

let carouselInterval = null;

function initCarousel() {
    const carouselContainer = document.querySelector('.carousel-container');
    const indicatorsContainer = document.getElementById('carousel-indicators');

    if (carouselContainer) {
        carouselContainer.innerHTML = '';
    }
    if (indicatorsContainer) {
        indicatorsContainer.innerHTML = '';
    }

    const images = collectCarouselImages();

    images.forEach((src, index) => {
        const finalSrc = src;

        if (carouselContainer) {
            const slide = document.createElement('div');
            slide.className = `carousel-slide ${index === 0 ? 'active' : ''}`;

            const img = document.createElement('img');
            img.src = finalSrc;
            img.alt = `植物图片 ${index + 1}`;
            img.className = 'w-full h-full object-fit: cover';

            // Base64 图片通常不需要 onerror 处理，但为了安全还是加上
            img.onerror = function () {
                console.error(`图片加载失败: ${finalSrc.substring(0, 50)}...`);
                this.src = 'img/default.png';
            };

            slide.appendChild(img);
            carouselContainer.appendChild(slide);
        }

        if (indicatorsContainer) {
            const indicator = document.createElement('div');
            indicator.className = `carousel-indicator ${index === 0 ? 'active' : ''}`;
            indicator.addEventListener('click', () => goToSlide(index));
            indicatorsContainer.appendChild(indicator);
        }
    });

    startCarousel();
}

// 开始轮播
function startCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
    }

    carouselInterval = setInterval(() => {
        const slides = document.querySelectorAll('.carousel-slide');
        if (slides.length > 0) {
            const nextSlide = (carouselConfig.currentSlide + 1) % slides.length;
            goToSlide(nextSlide);
        }
    }, carouselConfig.interval);
}

// 切换到指定幻灯片
function goToSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    const indicators = document.querySelectorAll('.carousel-indicator');

    if (slides.length === 0 || indicators.length === 0) return;

    slides[carouselConfig.currentSlide].classList.remove('active');
    indicators[carouselConfig.currentSlide].classList.remove('active');

    carouselConfig.currentSlide = index;

    slides[carouselConfig.currentSlide].classList.add('active');
    indicators[carouselConfig.currentSlide].classList.add('active');
}

const detailImagePreview = document.getElementById('detail-image-preview');
const detailImagePreviewImg = document.getElementById('detail-image-preview-img');
const detailImagePreviewClose = document.getElementById('detail-image-preview-close');
const detailImageContainer = document.getElementById('detail-image-container');
const detailImage = document.getElementById('detail-image');

function setupDetailImagePreview() {
    detailImageContainer.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetailImagePreview();
    });

    detailImage.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetailImagePreview();
    });

    detailImagePreviewClose.addEventListener('click', closeDetailImagePreview);

    detailImagePreview.addEventListener('click', function (e) {
        if (e.target === this) {
            closeDetailImagePreview();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && detailImagePreview.classList.contains('active')) {
            closeDetailImagePreview();
        }
    });
}

function openDetailImagePreview(imageSrc) {
    const detailImagePreview = document.getElementById('detail-image-preview');
    const detailImagePreviewImg = document.getElementById('detail-image-preview-img');

    if (imageSrc) {
        detailImagePreviewImg.src = imageSrc;
        detailImagePreview.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeDetailImagePreview() {
    const detailImagePreview = document.getElementById('detail-image-preview');
    if (detailImagePreview) {
        detailImagePreview.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function setupQrcodePreview() {
    document.querySelector('.website-qrcode')?.addEventListener('click', function (e) {
        e.preventDefault();
        openQrcodePreview('扫描二维码访问我们网站', 'img/website-qrcode.jpg');
    });
    document.querySelector('.wechat-qrcode')?.addEventListener('click', function (e) {
        e.preventDefault();
        openQrcodePreview('微信二维码', '扫描二维码联系我们微信', 'img/wx.jpg');
    });

    document.querySelector('.qq-qrcode')?.addEventListener('click', function (e) {
        e.preventDefault();
        openQrcodePreview('QQ二维码', '扫描二维码联系我们的QQ', 'img/qq.jpg');
    });

    document.getElementById('qrcode-preview-close')?.addEventListener('click', closeQrcodePreview);

    document.getElementById('qrcode-preview')?.addEventListener('click', function (e) {
        if (e.target === this) {
            closeQrcodePreview();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.getElementById('qrcode-preview')?.classList.contains('active')) {
            closeQrcodePreview();
        }
    });
}

function openQrcodePreview(title, desc, imageSrc) {
    const qrcodePreview = document.getElementById('qrcode-preview');
    const qrcodeTitle = document.getElementById('qrcode-title');
    const qrcodeDesc = document.getElementById('qrcode-desc');
    const qrcodePreviewImg = document.getElementById('qrcode-preview-img');

    if (qrcodeTitle) qrcodeTitle.textContent = title;
    if (qrcodeDesc) qrcodeDesc.textContent = desc;
    if (qrcodePreviewImg) qrcodePreviewImg.src = imageSrc;
    if (qrcodePreview) {
        qrcodePreview.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeQrcodePreview() {
    const qrcodePreview = document.getElementById('qrcode-preview');
    if (qrcodePreview) {
        qrcodePreview.classList.remove('active');
        document.body.style.overflow = '';
    }
}

const navbar = document.getElementById('navbar');
const backToTop = document.getElementById('backToTop');

window.addEventListener('scroll', function () {
    if (window.scrollY > 100) {
        navbar.classList.add('bg-white', 'shadow-md');
        navbar.classList.remove('bg-transparent');

        document.querySelector('#navbar span').classList.remove('text-white');
        document.querySelector('#navbar span').classList.add('text-dark');

        document.querySelector('#searchBtn').classList.remove('text-white');
        document.querySelector('#searchBtn').classList.add('text-dark');

        document.querySelectorAll('#navbar a').forEach(link => {
            link.classList.remove('text-white');
            link.classList.add('text-dark');
        });

        document.querySelector('#menuBtn').classList.remove('text-white');
        document.querySelector('#menuBtn').classList.add('text-dark');

        backToTop.classList.remove('opacity-0', 'invisible');
        backToTop.classList.add('opacity-100', 'visible');
    } else {
        navbar.classList.remove('bg-white', 'shadow-md');
        navbar.classList.add('bg-transparent');

        document.querySelector('#navbar span').classList.remove('text-dark');
        document.querySelector('#navbar span').classList.add('text-white');

        document.querySelector('#searchBtn').classList.remove('text-dark');
        document.querySelector('#searchBtn').classList.add('text-white');

        document.querySelectorAll('#navbar a').forEach(link => {
            link.classList.remove('text-dark');
            link.classList.add('text-white');
        });

        document.querySelector('#menuBtn').classList.remove('text-dark');
        document.querySelector('#menuBtn').classList.add('text-white');

        backToTop.classList.add('opacity-0', 'invisible');
        backToTop.classList.remove('opacity-100', 'visible');
    }
});

const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');

menuBtn.addEventListener('click', function () {
    if (mobileMenu.classList.contains('opacity-0')) {
        mobileMenu.classList.remove('opacity-0', '-translate-y-full', 'pointer-events-none');
        mobileMenu.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
        menuBtn.innerHTML = '<i class="fa fa-times"></i>';
    } else {
        mobileMenu.classList.add('opacity-0', '-translate-y-full', 'pointer-events-none');
        mobileMenu.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
        menuBtn.innerHTML = '<i class="fa fa-bars"></i>';
    }
});

const searchBtn = document.getElementById('searchBtn');
const searchModal = document.getElementById('searchModal');
const closeSearch = document.getElementById('closeSearch');
const modalSearchInput = document.getElementById('modalSearchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const plantSearchInput = document.getElementById('plantSearchInput');
const searchTags = document.querySelectorAll('.search-tag');

searchBtn.addEventListener('click', function () {
    searchModal.classList.remove('opacity-0', 'pointer-events-none');
    searchModal.classList.add('opacity-100', 'pointer-events-auto');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        document.getElementById('modalSearchInput').focus();
    }, 100);

    setTimeout(addModalSearchButton, 10);
});

mobileSearchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const searchText = this.value.trim();
        if (searchText) {
            currentSearch = searchText.toLowerCase();
            filterPlants(currentSearch, currentFilter);

            if (!mobileMenu.classList.contains('opacity-0')) {
                menuBtn.click();
            }

            document.getElementById('plants').scrollIntoView({behavior: 'smooth'});
        }
    }
});

// 移动端搜索图标点击事件
const mobileSearchIcon = mobileSearchInput.parentElement.querySelector('.fa-search');
if (mobileSearchIcon) {
    mobileSearchIcon.style.cursor = 'pointer';
    mobileSearchIcon.addEventListener('click', function () {
        const searchText = mobileSearchInput.value.trim();
        if (searchText) {
            currentSearch = searchText.toLowerCase();
            filterPlants(currentSearch, currentFilter);

            if (!mobileMenu.classList.contains('opacity-0')) {
                menuBtn.click();
            }

            document.getElementById('plants').scrollIntoView({behavior: 'smooth'});
        }
    });
}

closeSearch.addEventListener('click', closeSearchModal);

// 点击模态框背景关闭
searchModal.addEventListener('click', function (e) {
    if (e.target === searchModal) {
        closeSearchModal();
    }
});

// ESC键关闭搜索模态框
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && searchModal.classList.contains('opacity-100')) {
        closeSearchModal();
    }
});

// 搜索标签点击事件 - 立即搜索并跳转
searchTags.forEach(tag => {
    tag.addEventListener('click', function () {
        const searchText = this.textContent;
        modalSearchInput.value = searchText;

        closeSearchModal();

        performSearchAndJump(searchText);
    });
});

// 执行搜索并跳转到植物图鉴
function performSearchAndJump(searchText) {
    currentSearch = searchText.toLowerCase().trim();
    filterPlants(currentSearch, currentFilter);

    document.getElementById('plants').scrollIntoView({behavior: 'smooth'});
}

// 搜索输入框事件
function setupSearchInput(inputElement) {
    let isModalInput = inputElement === modalSearchInput;

    inputElement.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();

            const searchText = this.value.trim();
            if (searchText) {
                currentSearch = searchText.toLowerCase();
                filterPlants(currentSearch, currentFilter);

                if (isModalInput) {
                    closeSearchModal();
                }
                document.getElementById('plants').scrollIntoView({behavior: 'smooth'});
            }
        }
    });

    if (inputElement === plantSearchInput) {
        const searchIcon = inputElement.parentElement.querySelector('.fa-search');
        if (searchIcon) {
            searchIcon.style.cursor = 'pointer';
            searchIcon.addEventListener('click', function () {
                const searchText = inputElement.value.trim();
                if (searchText) {
                    currentSearch = searchText.toLowerCase();
                    filterPlants(currentSearch, currentFilter);
                }
            });
        }
    }
}

setupSearchInput(modalSearchInput);
setupSearchInput(mobileSearchInput);
setupSearchInput(plantSearchInput);

function addModalSearchButton() {
    if (!document.querySelector('#searchModal .search-action-button')) {
        const searchContainer = modalSearchInput.parentElement;
        const searchButton = document.createElement('button');
        searchButton.className = 'absolute right-3 top-1/2 transform -translate-y-1/2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors search-action-button';
        searchButton.innerHTML = '<i class="fa fa-search"></i> 搜索';
        searchButton.style.zIndex = '10';

        searchButton.addEventListener('click', handleModalSearch);

        modalSearchInput.style.paddingRight = '80px';

        searchContainer.appendChild(searchButton);
    }
}

function handleModalSearch() {
    const searchText = modalSearchInput.value.trim();
    if (searchText) {

        currentSearch = searchText.toLowerCase();
        filterPlants(currentSearch, currentFilter);

        closeSearchModal();

        document.getElementById('plants').scrollIntoView({behavior: 'smooth'});
    }
}

function closeSearchModal() {
    searchModal.classList.remove('opacity-100', 'pointer-events-auto');
    searchModal.classList.add('opacity-0', 'pointer-events-none');
    document.body.style.overflow = 'auto';
}

const filterButtons = document.querySelectorAll('.filter-btn');

filterButtons.forEach(button => {
    button.addEventListener('click', function () {
        filterButtons.forEach(btn => {
            btn.classList.remove('bg-primary', 'text-white');
            btn.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');
        });

        this.classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');
        this.classList.add('bg-primary', 'text-white');

        currentSearch = '';

        const searchInputs = [
            modalSearchInput,
            mobileSearchInput,
            plantSearchInput
        ];

        searchInputs.forEach(input => {
            if (input) input.value = '';
        });

        currentFilter = this.getAttribute('data-filter');

        filterPlants('', currentFilter);
    });
});

function filterPlants(searchText, filter) {
    const plantCards = document.querySelectorAll('.plant-card');
    let hasResults = false;
    let counts = {
        total: 0,
        乔木: 0,
        灌木: 0,
        草本: 0,
        藤本: 0,
        蕨类: 0
    };

    plantCards.forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        const family = card.getAttribute('data-family').toLowerCase();
        const type = card.getAttribute('data-type');
        const scientific = card.getAttribute('data-scientific').toLowerCase();
        const description = card.querySelector('.plant-description').textContent.toLowerCase();

        const matchesSearch = searchText === '' ||
            name.includes(searchText) ||
            family.includes(searchText) ||
            type.includes(searchText) ||
            scientific.includes(searchText) ||
            description.includes(searchText);

        const matchesFilter = filter === 'all' || type === filter;

        if (matchesSearch && matchesFilter) {
            card.style.display = 'block';
            hasResults = true;
            counts.total++;
            counts[type]++;
        } else {
            card.style.display = 'none';
        }
    });

    updatePlantStatistics(counts);
    document.getElementById('noResults').style.display = hasResults ? 'none' : 'flex';
}

function updatePlantStatistics(counts) {
    document.getElementById('total-plants-count').textContent = counts.total;
    document.getElementById('total-plants-display').textContent = counts.total;
    document.getElementById('trees-count').textContent = counts.乔木;
    document.getElementById('shrubs-count').textContent = counts.灌木;
    document.getElementById('herbs-count').textContent = counts.草本;
    document.getElementById('vines-count').textContent = counts.藤本 + counts.蕨类;

    if (!plantChart) {
        const ctx = document.getElementById('plantChart').getContext('2d');
        plantChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['乔木', '灌木', '草本', '藤本', '蕨类'],
                datasets: [{
                    data: [counts.乔木, counts.灌木, counts.草本, counts.藤本, counts.蕨类],
                    backgroundColor: [
                        '#2E7D32',
                        '#4CAF50',
                        '#8BC34A',
                        '#CDDC39',
                        '#FFC107'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                },
                cutout: '70%'
            }
        });
    } else {
        plantChart.data.datasets[0].data = [
            counts.乔木,
            counts.灌木,
            counts.草本,
            counts.藤本,
            counts.蕨类
        ];
        plantChart.update();
    }
}

function calculatePlantCounts() {
    let counts = {
        total: 0,
        乔木: 0,
        灌木: 0,
        草本: 0,
        藤本: 0,
        蕨类: 0
    };

    Object.keys(PlantState.plants).forEach(id => {
        const plant = PlantState.plants[id];
        counts.total++;
        counts[plant.category]++;
    });

    return counts;
}

function closeDetailPanel() {
    document.getElementById('specimen-detail').classList.remove('active');
    document.body.style.overflow = 'auto';

    if (currentMiniMap) {
        try {
            currentMiniMap.destroy();
            currentMiniMap = null;
        } catch (e) {
            console.warn("清理小地图时出现警告:", e);
        }
    }
}

document.getElementById('close-detail').addEventListener('click', closeDetailPanel);

document.getElementById('specimen-detail').addEventListener('click', function (e) {
    if (e.target === this) {
        closeDetailPanel();
    }
});

backToTop.addEventListener('click', function () {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();

        if (!mobileMenu.classList.contains('opacity-0')) {
            menuBtn.click();
        }

        const targetId = this.getAttribute('href');
        if (targetId === '#') return;

        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({behavior: 'smooth'});
        }
    });
});

function calculatePlantCounts() {
    let counts = {
        total: 0,
        乔木: 0,
        灌木: 0,
        草本: 0,
        藤本: 0,
        蕨类: 0
    };

    Object.keys(PlantState.plants).forEach(id => {
        const plant = PlantState.plants[id];
        counts.total++;
        counts[plant.category]++;
    });

    return counts;
}

function updateTopLocations() {
    const topLocationsContainer = document.getElementById('top-locations');
    topLocationsContainer.innerHTML = '';

    const locationCounts = {};

    Object.values(PlantState.plants).forEach(plant => {
        const location = plant.location || plant.distribution || '未知区域';
        locationCounts[location] = (locationCounts[location] || 0) + 1;
    });

    const sortedLocations = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    sortedLocations.forEach(([location, count], index) => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between';
        li.innerHTML = `
            <span class="flex items-center">
            <span class="w-6 h-6 bg-primary/20 text-primary text-xs rounded-full flex items-center justify-center mr-2">${index + 1}</span>
            ${location}
            </span>
            <span class="text-primary font-medium">${count}种</span>
            `;
        topLocationsContainer.appendChild(li);
    });
}

// 更新季节性植物推荐
function updateSeasonalPlants() {
    const seasonalPlantsContainer = document.getElementById('seasonal-plants');
    if (!seasonalPlantsContainer) {
        console.error('seasonal-plants 容器未找到');
        return;
    }

    seasonalPlantsContainer.innerHTML = '';

    const currentMonth = new Date().getMonth() + 1;
    let season = '';

    // 季节判断
    if (currentMonth >= 3 && currentMonth <= 5) {
        season = '春季';
    } else if (currentMonth >= 6 && currentMonth <= 8) {
        season = '夏季';
    } else if (currentMonth >= 9 && currentMonth <= 11) {
        season = '秋季';
    } else {
        season = '冬季';
    }

    console.log(`当前季节: ${season}, 月份: ${currentMonth}`);

    const allPlants = Object.values(PlantState.plants);
    let seasonalPlants = allPlants.slice(0, Math.min(6, allPlants.length));

    if (seasonalPlants.length === 0) {
        seasonalPlantsContainer.innerHTML = `
            <span class="text-gray-500 text-sm">暂无季节植物推荐</span>
        `;
        return;
    }

    seasonalPlants.forEach(plant => {
        // 找到对应的 plantId
        const plantId = Object.keys(PlantState.plants).find(id =>
            PlantState.plants[id].name === plant.name
        );

        if (!plantId) return;

        const tag = document.createElement('span');
        tag.className = 'px-3 py-1 bg-primary/10 text-primary rounded-full text-sm hover:bg-primary/20 transition-colors cursor-pointer seasonal-plant-tag';
        tag.textContent = plant.name;
        tag.setAttribute('data-id', plantId);

        tag.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            console.log('点击植物:', this.textContent, 'ID:', this.getAttribute('data-id'));

            const plantId = this.getAttribute('data-id');
            if (plantId) {
                // 检查登录状态
                if (!PlantState.currentUser) {
                    alert('请先登录才能查看植物详情！');
                    window.location.href = 'login.html';
                    return;
                }

                // 显示详情
                showPlantDetails(plantId);

                // 滚动到植物区域
                setTimeout(() => {
                    const plantsSection = document.getElementById('plants');
                    if (plantsSection) {
                        plantsSection.scrollIntoView({behavior: 'smooth'});
                    }
                }, 100);
            }
        });

        seasonalPlantsContainer.appendChild(tag);
    });

    console.log('季节植物标签已创建:', seasonalPlantsContainer.children.length, '个');
}

window.addEventListener('load', initApp);
