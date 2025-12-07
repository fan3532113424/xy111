// 获取植物的点赞、收藏、评论统计数据
async function fetchPlantInteractionStats(plantId) {
    try {
        const {data: interactions, error: interactionsError} = await supabase
            .from('plant_interactions')
            .select('is_liked, is_favorite')
            .eq('plant_id', plantId);

        if (interactionsError) throw interactionsError;

        const {data: comments, error: commentsError} = await supabase
            .from('plant_comments')
            .select('id')
            .eq('plant_id', plantId);

        if (commentsError) throw commentsError;

        const stats = {
            likes: interactions.filter(i => i.is_liked).length,
            favorites: interactions.filter(i => i.is_favorite).length,
            comments: comments.length
        };

        return stats;
    } catch (error) {
        console.error('获取植物互动数据失败:', error);
        return {likes: 0, favorites: 0, comments: 0};
    }
}

// 获取用户对植物的互动状态
async function fetchUserPlantInteraction(plantId, userId) {
    try {
        const {data, error} = await supabase
            .from('plant_interactions')
            .select('*')
            .eq('plant_id', plantId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        return data || {is_liked: false, is_favorite: false};
    } catch (error) {
        console.error('获取用户互动状态失败:', error);
        return {is_liked: false, is_favorite: false};
    }
}

// 更新用户的点赞/收藏状态
async function updatePlantInteraction(plantId, userId, type, value) {
    try {
        const {data: existing, error: checkError} = await supabase
            .from('plant_interactions')
            .select('id')
            .eq('plant_id', plantId)
            .eq('user_id', userId)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        if (existing) {
            // 更新现有记录
            const {error} = await supabase
                .from('plant_interactions')
                .update({
                    [type]: value,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // 创建新记录
            const interactionData = {
                plant_id: plantId,
                user_id: userId,
                [type]: value
            };

            const {error} = await supabase
                .from('plant_interactions')
                .insert([interactionData]);

            if (error) throw error;
        }

        // 获取更新后的统计数据
        const stats = await fetchPlantInteractionStats(plantId);
        return stats;
    } catch (error) {
        console.error('更新植物互动失败:', error);
        throw error;
    }
}


// 删除评论
async function deletePlantComment(commentId, userId) {
    try {
        // 先检查权限
        const {data: comment, error: checkError} = await supabase
            .from('plant_comments')
            .select('user_id, plant_id')
            .eq('id', commentId)
            .single();

        if (checkError) throw checkError;

        // 只能删除自己的评论
        if (comment.user_id !== userId) {
            throw new Error('没有权限删除此评论');
        }

        const {error} = await supabase
            .from('plant_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;

        // 获取更新后的统计数据
        const stats = await fetchPlantInteractionStats(comment.plant_id);
        return stats;
    } catch (error) {
        console.error('删除评论失败:', error);
        throw error;
    }
}

// Supabase配置
const SUPABASE_URL = 'https://sgwbztuizxowiacpwzmy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnd2J6dHVpenhvd2lhY3B3em15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMzIyMDYsImV4cCI6MjA3OTkwODIwNn0.js6fUBJ9FGRMkVgp80Q-8D6hX-xXbr29rWKyJgOA9b4';

// 创建 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase 初始化完成:', supabase);

// 用户数据
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

// 好友数据
let friendsData = [];
let plantLikesCache = {};
let plantFavoritesCache = {};

// 在文件开头添加
let isUpdatingLike = {};
let isUpdatingFavorite = {};

// 作品数据
let worksData = [];

// 收藏点赞数据
let favoritesData = [];

// 消息数据
let notificationsData = [];
let conversationsData = [];
let messagesData = {};
let currentConversationId = null;

// 植物数据
let plantData = {};

// 预设用户数据
const presetUsers = [

];

// 数据缓存
let dataCache = {
    userData: null,
    friendsData: null,
    worksData: null,
    favoritesData: null,
    plantsCount: null,
    notificationsData: null,
    conversationsData: null
};

// 评论数据存储
let plantComments = {};
let plantLikes = {};
let plantFavorites = {};
let currentCommentPlantId = null;

// 用户列表（用于 @ 提及）
let allUsers = [];
let currentUser = '';
let full_name ='';

// 当前编辑的植物ID
let editingPlantId = null;

// ========== 新增：植物管理模态框相关变量 ==========
let addSelectorMap = null;
let editSelectorMap = null;
let addCurrentMarker = null;
let editCurrentMarker = null;
let addSelectedPoint = null;
let editSelectedPoint = null;
let addUploadedImages = [];
let editUploadedImages = [];

// 初始化页面
document.addEventListener('DOMContentLoaded', function () {
    // 从localStorage获取当前用户信息
    const currentUser = localStorage.getItem('currentUser');
    const userRole = localStorage.getItem('userRole');
    const full_name = localStorage.getItem('full_name');

    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'login.html';
        return;
    }

    console.log('当前用户:', currentUser, '角色:', userRole);

    // 立即显示基本信息
    document.getElementById('userName').textContent = full_name;
    document.getElementById('username').value = currentUser;
    document.getElementById('fullName').value = full_name;
    document.getElementById('email').value = currentUser + '';

    // 加载用户数据
    loadUserData(currentUser, userRole, full_name);

    // 设置标签页切换
    setupTabs();

    // 设置头像上传
    setupAvatarUpload();

    // 设置表单提交
    setupForms();

    // 设置按钮事件
    setupButtons();

    // 设置搜索功能
    setupSearch();

    // 设置好友功能
    setupFriends();

    // 设置作品功能
    setupWorks();

    // 设置收藏点赞功能
    setupFavorites();

    // 设置消息通知功能
    setupMessages();

    // 设置移动端左侧菜单点击跳转
    setupMobileSidebarNavigation();

    // 初始化植物管理模态框
    initPlantModals();
});

function initPlantModals() {
    setupPlantModalEventListeners();
    initImageUpload();
}

// 设置植物模态框事件监听器
function setupPlantModalEventListeners() {
    // 添加植物按钮
    document.getElementById('addPlantBtn').addEventListener('click', openAddPlantModal);

    // 关闭按钮
    document.getElementById('closeAddModal').addEventListener('click', closeAddPlantModal);
    document.getElementById('closeEditModal').addEventListener('click', closeEditPlantModal);

    // 取消按钮
    document.getElementById('cancelAddForm').addEventListener('click', closeAddPlantModal);
    document.getElementById('cancelEditForm').addEventListener('click', closeEditPlantModal);

    // 重置位置按钮
    document.getElementById('addResetLocation').addEventListener('click', resetAddLocationMarker);
    document.getElementById('editResetLocation').addEventListener('click', resetEditLocationMarker);

    // 表单提交
    document.getElementById('addPlantForm').addEventListener('submit', handleAddPlantSubmit);
    document.getElementById('editPlantForm').addEventListener('submit', handleEditPlantSubmit);

    // 点击模态框外部关闭
    document.getElementById('addPlantModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('addPlantModal')) closeAddPlantModal();
    });

    document.getElementById('editPlantModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('editPlantModal')) closeEditPlantModal();
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('addPlantModal').classList.contains('active')) closeAddPlantModal();
            if (document.getElementById('editPlantModal').classList.contains('active')) closeEditPlantModal();
        }
    });
}

// 打开添加植物模态框
function openAddPlantModal() {
    document.getElementById('addPlantModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    resetAddPlantForm();

    // 延迟初始化地图
    setTimeout(() => {
        initAddSelectorMap();
    }, 100);
}

// 打开编辑植物模态框
function openEditPlantModal(plantId) {
    editingPlantId = plantId;
    const plant = worksData.find(p => p.id == plantId);

    if (!plant) {
        showSuccessMessage('未找到植物数据');
        return;
    }

    // 填充表单数据
    document.getElementById('editPlantName').value = plant.name || '';
    document.getElementById('editPlantScientific').value = plant.scientific_name || '';
    document.getElementById('editPlantCategory').value = plant.category || '';
    document.getElementById('editPlantFamily').value = plant.family || '';
    document.getElementById('editPlantGenus').value = plant.genus || '';
    document.getElementById('editPlantEnvironment').value = plant.environment || '';
    document.getElementById('editPlantLocation').value = plant.location || '';
    document.getElementById('editPlantDescription').value = plant.description || '';
    document.getElementById('editPlantCollectionDate').value = plant.collection_date || '';

    // 设置图片
    editUploadedImages = [];
    if (plant.image_url) {
        editUploadedImages.push(plant.image_url);
    }
    updateEditImagePreview();

    // 设置地图位置
    if (plant.longitude && plant.latitude) {
        editSelectedPoint = {
            lng: parseFloat(plant.longitude),
            lat: parseFloat(plant.latitude)
        };
    }

    document.getElementById('editPlantModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    // 延迟初始化地图
    setTimeout(() => {
        initEditSelectorMap();

        // 在地图初始化完成后设置位置标记
        const setupMarker = () => {
            if (plant.longitude && plant.latitude) {
                if (editSelectorMap) {
                    // 清除任何现有的标记
                    if (editCurrentMarker) {
                        editSelectorMap.removeOverlay(editCurrentMarker);
                        editCurrentMarker = null;
                    }

                    // 创建新的标记
                    const point = new BMap.Point(plant.longitude, plant.latitude);
                    editCurrentMarker = new BMap.Marker(point);
                    editSelectorMap.addOverlay(editCurrentMarker);

                    // 添加动画效果
                    editCurrentMarker.setAnimation(BMAP_ANIMATION_BOUNCE);

                    // 更新位置描述
                    document.getElementById('editPlantLocationMap').value = `经度: ${plant.longitude.toFixed(6)}, 纬度: ${plant.latitude.toFixed(6)}`;

                    // 将地图中心移动到标记位置
                    editSelectorMap.panTo(point);

                    // 设置初始缩放级别
                    editSelectorMap.setZoom(17);
                }
            } else {
                resetEditLocationMarker();
            }
        };

        setTimeout(setupMarker, 800);
    }, 100);
}

// 关闭添加植物模态框
function closeAddPlantModal() {
    document.getElementById('addPlantModal').classList.remove('active');
    document.body.style.overflow = 'auto';

    // 清理地图资源
    if (addSelectorMap) {
        try {
            addSelectorMap.destroy();
        } catch (e) {
            console.warn("清理添加模态框地图时出现警告:", e);
        }
        addSelectorMap = null;
    }

    // 清理标记引用
    addCurrentMarker = null;
    addSelectedPoint = null;
}

// 关闭编辑植物模态框
function closeEditPlantModal() {
    document.getElementById('editPlantModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    editingPlantId = null;

    // 清理地图资源
    if (editSelectorMap) {
        try {
            editSelectorMap.destroy();
        } catch (e) {
            console.warn("清理编辑模态框地图时出现警告:", e);
        }
        editSelectorMap = null;
    }

    // 清理标记引用
    editCurrentMarker = null;
    editSelectedPoint = null;
}

// 重置添加植物表单
function resetAddPlantForm() {
    document.getElementById('addPlantForm').reset();
    resetAddLocationMarker();
    addUploadedImages = [];
    updateAddImagePreview();
    document.getElementById('addImageUpload').value = '';
}

// 初始化添加模态框地图
function initAddSelectorMap() {
    const mapContainer = document.getElementById('add-baidu-map-selector-container');
    if (!mapContainer) return;

    // 清理现有地图
    if (addSelectorMap) {
        try {
            addSelectorMap.destroy();
        } catch (e) {
            console.warn('清理添加模态框旧地图实例时出现警告:', e);
        }
        addSelectorMap = null;
    }

    // 确保容器有正确的尺寸
    mapContainer.style.width = '100%';
    mapContainer.style.height = '400px';
    mapContainer.style.minHeight = '400px';

    try {
        addSelectorMap = new BMap.Map("add-baidu-map-selector-container");
        const point = new BMap.Point(119.053194, 33.558272);

        addSelectorMap.centerAndZoom(point, 17);
        addSelectorMap.enableScrollWheelZoom(true);

        addSelectorMap.addControl(new BMap.MapTypeControl({
            mapTypes: [BMAP_NORMAL_MAP, BMAP_HYBRID_MAP]
        }));

        addSelectorMap.addControl(new BMap.NavigationControl({
            type: BMAP_NAVIGATION_CONTROL_ZOOM,
            anchor: BMAP_ANCHOR_TOP_LEFT
        }));

        addSelectorMap.addEventListener("click", function (e) {
            if (e.overlay) return;

            const lng = e.point.lng;
            const lat = e.point.lat;
            setAddLocationMarker(lng, lat);
            addSelectedPoint = {lng: lng, lat: lat};
        });

        setTimeout(() => {
            if (addSelectorMap) {
                addSelectorMap.checkResize();
            }
        }, 500);

    } catch (error) {
        console.error('添加模态框地图初始化失败:', error);
    }
}

// 初始化编辑模态框地图
function initEditSelectorMap() {
    const mapContainer = document.getElementById('edit-baidu-map-selector-container');
    if (!mapContainer) return;

    // 清理现有地图
    if (editSelectorMap) {
        try {
            editSelectorMap.destroy();
        } catch (e) {
            console.warn('清理编辑模态框旧地图实例时出现警告:', e);
        }
        editSelectorMap = null;
    }

    // 确保容器有正确的尺寸
    mapContainer.style.width = '100%';
    mapContainer.style.height = '400px';
    mapContainer.style.minHeight = '400px';

    try {
        editSelectorMap = new BMap.Map("edit-baidu-map-selector-container");
        const point = new BMap.Point(119.053194, 33.558272);

        editSelectorMap.centerAndZoom(point, 17);
        editSelectorMap.enableScrollWheelZoom(true);

        editSelectorMap.addControl(new BMap.MapTypeControl({
            mapTypes: [BMAP_NORMAL_MAP, BMAP_HYBRID_MAP]
        }));

        editSelectorMap.addControl(new BMap.NavigationControl({
            type: BMAP_NAVIGATION_CONTROL_ZOOM,
            anchor: BMAP_ANCHOR_TOP_LEFT
        }));

        editSelectorMap.addEventListener("click", function (e) {
            if (e.overlay) return;

            const lng = e.point.lng;
            const lat = e.point.lat;
            setEditLocationMarker(lng, lat);
            editSelectedPoint = {lng: lng, lat: lat};
        });

        setTimeout(() => {
            if (editSelectorMap) {
                editSelectorMap.checkResize();
            }
        }, 500);

    } catch (error) {
        console.error('编辑模态框地图初始化失败:', error);
    }
}

// 设置添加模态框位置标记
function setAddLocationMarker(lng, lat) {
    if (!addSelectorMap) return;

    // 清除现有标记
    if (addCurrentMarker) {
        addSelectorMap.removeOverlay(addCurrentMarker);
        addCurrentMarker = null;
    }

    // 创建新标记
    const point = new BMap.Point(lng, lat);
    addCurrentMarker = new BMap.Marker(point);
    addSelectorMap.addOverlay(addCurrentMarker);

    // 添加动画效果
    addCurrentMarker.setAnimation(BMAP_ANIMATION_BOUNCE);

    // 更新位置描述
    document.getElementById('addPlantLocationMap').value = `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;
}

// 设置编辑模态框位置标记
function setEditLocationMarker(lng, lat) {
    if (!editSelectorMap) return;

    // 清除现有标记
    if (editCurrentMarker) {
        editSelectorMap.removeOverlay(editCurrentMarker);
        editCurrentMarker = null;
    }

    // 创建新标记
    const point = new BMap.Point(lng, lat);
    editCurrentMarker = new BMap.Marker(point);
    editSelectorMap.addOverlay(editCurrentMarker);

    // 添加动画效果
    editCurrentMarker.setAnimation(BMAP_ANIMATION_BOUNCE);

    // 更新位置描述
    document.getElementById('editPlantLocationMap').value = `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;
}

// 重置添加模态框位置标记
function resetAddLocationMarker() {
    if (addCurrentMarker && addSelectorMap) {
        addSelectorMap.removeOverlay(addCurrentMarker);
        addCurrentMarker = null;
    }
    addSelectedPoint = null;
    document.getElementById('addPlantLocationMap').value = '';

    // 重置地图视图到初始中心
    if (addSelectorMap) {
        const point = new BMap.Point(119.053194, 33.558272);
        addSelectorMap.panTo(point);
    }
}

// 重置编辑模态框位置标记
function resetEditLocationMarker() {
    if (editCurrentMarker && editSelectorMap) {
        editSelectorMap.removeOverlay(editCurrentMarker);
        editCurrentMarker = null;
    }
    editSelectedPoint = null;
    document.getElementById('editPlantLocationMap').value = '';

    // 重置地图视图到初始中心
    if (editSelectorMap) {
        const point = new BMap.Point(119.053194, 33.558272);
        editSelectorMap.panTo(point);
    }
}

// 图片上传功能
function initImageUpload() {
    // 添加模态框图片上传
    const addImageDropzone = document.getElementById('addImageDropzone');
    const addImageUpload = document.getElementById('addImageUpload');

    addImageDropzone.addEventListener('click', () => addImageUpload.click());
    addImageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        addImageDropzone.classList.add('dragover');
    });
    addImageDropzone.addEventListener('dragleave', () => {
        addImageDropzone.classList.remove('dragover');
    });
    addImageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        addImageDropzone.classList.remove('dragover');
        handleAddImageFiles(e.dataTransfer.files);
    });
    addImageUpload.addEventListener('change', () => handleAddImageFiles(addImageUpload.files));

    // 编辑模态框图片上传
    const editImageDropzone = document.getElementById('editImageDropzone');
    const editImageUpload = document.getElementById('editImageUpload');

    editImageDropzone.addEventListener('click', () => editImageUpload.click());
    editImageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        editImageDropzone.classList.add('dragover');
    });
    editImageDropzone.addEventListener('dragleave', () => {
        editImageDropzone.classList.remove('dragover');
    });
    editImageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        editImageDropzone.classList.remove('dragover');
        handleEditImageFiles(e.dataTransfer.files);
    });
    editImageUpload.addEventListener('change', () => handleEditImageFiles(editImageUpload.files));
}

// 处理添加模态框图片文件
function handleAddImageFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                addUploadedImages.push(e.target.result);
                updateAddImagePreview();
            };
            reader.readAsDataURL(file);
        }
    }
}

// 处理编辑模态框图片文件
function handleEditImageFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                editUploadedImages.push(e.target.result);
                updateEditImagePreview();
            };
            reader.readAsDataURL(file);
        }
    }
}

// 更新添加模态框图片预览
function updateAddImagePreview() {
    const container = document.getElementById('addImagePreview');
    container.innerHTML = '';

    addUploadedImages.forEach((src, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'upload-preview-item';

        const img = document.createElement('img');
        img.src = src;

        const removeBtn = document.createElement('div');
        removeBtn.className = 'upload-preview-remove';
        removeBtn.innerHTML = '<i class="fa fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            addUploadedImages.splice(index, 1);
            updateAddImagePreview();
        });

        itemDiv.appendChild(img);
        itemDiv.appendChild(removeBtn);
        container.appendChild(itemDiv);
    });

    document.getElementById('addUploadCount').textContent = addUploadedImages.length;
}

// 更新编辑模态框图片预览
function updateEditImagePreview() {
    const container = document.getElementById('editImagePreview');
    container.innerHTML = '';

    editUploadedImages.forEach((src, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'upload-preview-item';

        const img = document.createElement('img');
        img.src = src;

        const removeBtn = document.createElement('div');
        removeBtn.className = 'upload-preview-remove';
        removeBtn.innerHTML = '<i class="fa fa-times"></i>';
        removeBtn.addEventListener('click', () => {
            editUploadedImages.splice(index, 1);
            updateEditImagePreview();
        });

        itemDiv.appendChild(img);
        itemDiv.appendChild(removeBtn);
        container.appendChild(itemDiv);
    });

    document.getElementById('editUploadCount').textContent = editUploadedImages.length;
}

// 处理添加植物表单提交
async function handleAddPlantSubmit(e) {
    e.preventDefault();

    if (!validateAddPlantForm()) {
        return;
    }

    const submitBtn = document.getElementById('addPlantForm').querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> 保存中...';
    submitBtn.disabled = true;

    try {
        // 获取表单数据
        const plantData = {
            name: document.getElementById('addPlantName').value.trim(),
            scientific_name: document.getElementById('addPlantScientific').value.trim(),
            category: document.getElementById('addPlantCategory').value,
            family: document.getElementById('addPlantFamily').value.trim(),
            genus: document.getElementById('addPlantGenus').value.trim(),
            environment: document.getElementById('addPlantEnvironment').value.trim(),
            location: document.getElementById('addPlantLocation').value.trim(),
            description: document.getElementById('addPlantDescription').value.trim(),
            collection_date: document.getElementById('addPlantCollectionDate').value,
            created_by: localStorage.getItem('currentUser'),
        };

        // 如果有经纬度数据
        if (addSelectedPoint) {
            plantData.longitude = addSelectedPoint.lng;
            plantData.latitude = addSelectedPoint.lat;
        }

        // 如果有图片数据
        if (addUploadedImages.length > 0) {
            plantData.image_url = addUploadedImages[0];
        }

        // 保存到Supabase
        const result = await savePlant(plantData);

        if (result) {
            showSuccessMessage(`植物 "${plantData.name}" 已成功添加！`);
            setTimeout(() => {
                closeAddPlantModal();
                // 重新加载作品内容
                loadWorksContent();
            }, 1500);
        }
    } catch (error) {
        console.error('添加植物失败:', error);
        alert('添加植物失败，请稍后重试！');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// 处理编辑植物表单提交
async function handleEditPlantSubmit(e) {
    e.preventDefault();

    if (!validateEditPlantForm()) {
        return;
    }

    if (!editingPlantId) {
        alert('编辑的植物ID不存在');
        return;
    }

    const submitBtn = document.getElementById('editPlantForm').querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> 更新中...';
    submitBtn.disabled = true;

    try {
        // 获取表单数据
        const plantData = {
            name: document.getElementById('editPlantName').value.trim(),
            scientific_name: document.getElementById('editPlantScientific').value.trim(),
            category: document.getElementById('editPlantCategory').value,
            family: document.getElementById('editPlantFamily').value.trim(),
            genus: document.getElementById('editPlantGenus').value.trim(),
            environment: document.getElementById('editPlantEnvironment').value.trim(),
            location: document.getElementById('editPlantLocation').value.trim(),
            description: document.getElementById('editPlantDescription').value.trim(),
            collection_date: document.getElementById('editPlantCollectionDate').value
        };

        // 如果有经纬度数据
        if (editSelectedPoint) {
            plantData.longitude = editSelectedPoint.lng;
            plantData.latitude = editSelectedPoint.lat;
        }

        // 如果有图片数据
        if (editUploadedImages.length > 0) {
            plantData.image_url = editUploadedImages[0];
        }

        // 更新到Supabase
        const result = await savePlant(plantData, editingPlantId);

        if (result) {
            showSuccessMessage(`植物 "${plantData.name}" 已成功更新！`);
            setTimeout(() => {
                closeEditPlantModal();
                // 重新加载作品内容
                loadWorksContent();
            }, 1500);
        }
    } catch (error) {
        console.error('更新植物失败:', error);
        alert('更新植物失败，请稍后重试！');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// 验证添加植物表单
function validateAddPlantForm() {
    const plantName = document.getElementById('addPlantName').value.trim();
    const plantCategory = document.getElementById('addPlantCategory').value;

    if (!plantName) {
        alert('请填写植物名称');
        document.getElementById('addPlantName').focus();
        return false;
    }

    if (!plantCategory) {
        alert('请选择植物类别');
        document.getElementById('addPlantCategory').focus();
        return false;
    }

    return true;
}

// 验证编辑植物表单
function validateEditPlantForm() {
    const plantName = document.getElementById('editPlantName').value.trim();
    const plantCategory = document.getElementById('editPlantCategory').value;

    if (!plantName) {
        alert('请填写植物名称');
        document.getElementById('editPlantName').focus();
        return false;
    }

    if (!plantCategory) {
        alert('请选择植物类别');
        document.getElementById('editPlantCategory').focus();
        return false;
    }

    return true;
}

// 保存植物（添加或编辑）
async function savePlant(plantData, plantId = null) {
    try {
        let result;
        const now = new Date().toISOString();

        if (plantId) {
            // 编辑现有植物
            const {data, error} = await supabase
                .from('plants')
                .update({
                    ...plantData,
                    updated_at: now
                })
                .eq('id', plantId)
                .select();

            if (error) throw error;
            result = data[0];

            // 更新本地数据
            const index = worksData.findIndex(p => p.id == plantId);
            if (index !== -1) {
                worksData[index] = {...worksData[index], ...plantData};
            }
        } else {
            // 添加新植物
            const {data, error} = await supabase
                .from('plants')
                .insert([{
                    ...plantData,
                    created_at: now,
                    updated_at: now
                }])
                .select();

            if (error) throw error;
            result = data[0];

            // 添加到本地数据
            worksData.unshift(result);
        }

        return result;
    } catch (error) {
        console.error('保存植物失败:', error);
        throw error;
    }
}

// 窗口大小变化时调整地图尺寸
window.addEventListener('resize', () => {
    if (addSelectorMap) {
        setTimeout(() => addSelectorMap.checkResize(), 100);
    }
    if (editSelectorMap) {
        setTimeout(() => editSelectorMap.checkResize(), 100);
    }
});

// 设置移动端左侧菜单点击跳转
function setupMobileSidebarNavigation() {
    const sidebarButtons = document.querySelectorAll('.tab-button');

    sidebarButtons.forEach(button => {
        button.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                const tabName = this.getAttribute('data-tab');
                const targetElement = document.getElementById(tabName + 'Tab');

                if (targetElement) {
                    // 计算滚动位置，考虑固定导航栏的高度
                    const headerHeight = document.querySelector('header').offsetHeight;
                    const offsetTop = targetElement.offsetTop - headerHeight - 20;

                    // 平滑滚动到目标位置
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });

                    // 更新激活状态
                    sidebarButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');

                    // 显示对应内容
                    const tabContents = document.querySelectorAll('.tab-content');
                    tabContents.forEach(content => {
                        if (content.id === tabName + 'Tab') {
                            content.classList.add('active');
                        } else {
                            content.classList.remove('active');
                        }
                    });
                }
            }
        });
    });
}

// 设置消息通知功能
function setupMessages() {
    // 设置子标签页切换
    document.querySelectorAll('.subtab-button').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.subtab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.subtab-content').forEach(content => content.classList.remove('active'));

            this.classList.add('active');
            const subtabId = this.getAttribute('data-subtab') + 'Subtab';
            document.getElementById(subtabId).classList.add('active');

            if (this.getAttribute('data-subtab') === 'chats') {
                loadConversations();
            } else if (this.getAttribute('data-subtab') === 'notifications') {
                loadNotifications();
            }
        });
    });

    // 设置发送消息功能
    document.querySelector('.send-btn').addEventListener('click', sendMessage);
    document.querySelector('.chat-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// 设置好友功能
function setupFriends() {
    // 设置筛选按钮事件
    document.querySelectorAll('#friendsTab .filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#friendsTab .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadFriendsContent(this.getAttribute('data-filter'));
        });
    });

    // 添加好友按钮
    document.getElementById('addFriendBtn').addEventListener('click', function () {
        document.getElementById('addFriendModal').classList.add('active');
    });

    // 关闭好友模态框
    document.getElementById('closeFriendModal').addEventListener('click', function () {
        document.getElementById('addFriendModal').classList.remove('active');
    });

    // 搜索用户功能
    document.getElementById('searchUserInput').addEventListener('input', function () {
        searchUsers(this.value);
    });
}

// 设置作品功能
function setupWorks() {
    // 设置筛选按钮事件
    document.querySelectorAll('#worksTab .filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#worksTab .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadWorksContent(this.getAttribute('data-filter'));
        });
    });

    // 搜索框事件
    document.getElementById('worksSearchInput').addEventListener('input', function () {
        filterWorks(this.value);
    });
}

// 设置收藏点赞功能
function setupFavorites() {
    // 设置筛选按钮事件
    document.querySelectorAll('#favoritesTab .filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#favoritesTab .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadFavoritesContent(this.getAttribute('data-filter'));
        });
    });
}

// 从Supabase获取用户数据
async function fetchUserData(username) {
    try {
        // 检查缓存
        if (dataCache.userData && dataCache.userData.username === username) {
            return dataCache.userData;
        }

        const {data: user, error} = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error) throw error;

        // 缓存数据
        dataCache.userData = user;
        return user;
    } catch (error) {
        console.error('获取用户数据失败:', error);
        return null;
    }
}

// 从Supabase获取植物点赞数据
async function fetchPlantLikes(plantId = null) {
    try {
        if (plantId) {
            const {data, error} = await supabase
                .from('plant_likes')
                .select('*')
                .eq('plant_id', plantId);

            if (error) throw error;
            return data || [];
        }

        // 获取当前用户的所有点赞
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return [];

        const {data, error} = await supabase
            .from('plant_likes')
            .select('*')
            .eq('username', currentUser);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('获取点赞数据失败:', error);
        return [];
    }
}

// 从Supabase获取植物收藏数据
async function fetchPlantFavorites(plantId = null) {
    try {
        if (plantId) {
            const {data, error} = await supabase
                .from('plant_favorites')
                .select('*')
                .eq('plant_id', plantId);

            if (error) throw error;
            return data || [];
        }

        // 获取当前用户的所有收藏
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return [];

        const {data, error} = await supabase
            .from('plant_favorites')
            .select('*')
            .eq('username', currentUser);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('获取收藏数据失败:', error);
        return [];
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

// 从Supabase获取好友数据
async function fetchFriendsData(username) {
    try {
        // 检查缓存
        if (dataCache.friendsData && dataCache.friendsData.username === username) {
            return dataCache.friendsData.data;
        }

        // 这里假设有一个friends表存储好友关系
        const {data: friends, error} = await supabase
            .from('friends')
            .select('*, users!friends_friend_id_fkey(*)')
            .eq('user_id', username)
            .order('pinned', {ascending: false})
            .order('created_at', {ascending: false});

        if (error) throw error;

        // 缓存数据
        dataCache.friendsData = {
            username: username,
            data: friends || []
        };

        return dataCache.friendsData.data;
    } catch (error) {
        console.error('获取好友数据失败:', error);
        // 返回模拟数据用于演示
        return getMockFriendsData();
    }
}

// 模拟好友数据（实际使用时请删除）
function getMockFriendsData() {
    return [

    ];
}

// 从Supabase获取作品数据
async function fetchWorksData(username, role,full_name) {
    try {
        // 检查缓存
        if (dataCache.worksData && dataCache.worksData.username === username) {
            return dataCache.worksData.data;
        }

        let works;

        // 如果是管理员或超级管理员，可以查看所有用户的作品
        if (role === 'admin' || role === 'super-admin') {
            const {data, error} = await supabase
                .from('plants')
                .select('*')
                .order('created_at', {ascending: false});

            if (error) throw error;
            works = data || [];
        } else {
            // 普通用户只能查看自己的作品
            const {data, error} = await supabase
                .from('plants')
                .select('*')
                .eq('created_by', username)
                .order('created_at', {ascending: false});

            if (error) throw error;
            works = data || [];
        }

        // 缓存数据
        dataCache.worksData = {
            username: username,
            data: works,
            full_name: full_name
        };

        return dataCache.worksData.data;
    } catch (error) {
        console.error('获取作品数据失败:', error);
        // 返回模拟数据用于演示
        return getMockWorksData();
    }
}

// 模拟作品数据（实际使用时请删除）
function getMockWorksData() {
    return [

    ];
}

// 从Supabase获取收藏点赞数据
async function fetchUserFavorites(username) {
    try {
        // 检查缓存
        if (dataCache.favoritesData && dataCache.favoritesData.username === username) {
            return dataCache.favoritesData.data;
        }

        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return [];

        // 获取用户的点赞数据
        const {data: likes, error: likesError} = await supabase
            .from('plant_likes')
            .select('plant_id, created_at')
            .eq('username', currentUser);

        if (likesError) {
            console.error('获取点赞数据失败:', likesError);
            return [];
        }

        // 获取用户的收藏数据
        const {data: favorites, error: favoritesError} = await supabase
            .from('plant_favorites')
            .select('plant_id, created_at')
            .eq('username', currentUser);

        if (favoritesError) {
            console.error('获取收藏数据失败:', favoritesError);
            return [];
        }

        // 合并数据并获取植物详情
        const allPlantIds = new Set();
        likes?.forEach(like => allPlantIds.add(like.plant_id));
        favorites?.forEach(fav => allPlantIds.add(fav.plant_id));

        if (allPlantIds.size === 0) return [];

        // 获取植物详情
        const {data: plants, error: plantsError} = await supabase
            .from('plants')
            .select('*')
            .in('id', Array.from(allPlantIds));

        if (plantsError) {
            console.error('获取植物详情失败:', plantsError);
            return [];
        }

        // 构建favoritesData
        const favoritesData = plants.map(plant => {
            const isLiked = likes?.some(like => like.plant_id === plant.id) || false;
            const isFavorited = favorites?.some(fav => fav.plant_id === plant.id) || false;

            // 使用点赞或收藏的创建时间，哪个更晚用哪个
            const likeTime = likes?.find(like => like.plant_id === plant.id)?.created_at;
            const favTime = favorites?.find(fav => fav.plant_id === plant.id)?.created_at;
            const created_at = likeTime && favTime
                ? (new Date(likeTime) > new Date(favTime) ? likeTime : favTime)
                : (likeTime || favTime || plant.created_at);

            return {
                id: plant.id,
                plant_id: plant.id,
                plant_name: plant.name,
                plant_image: plant.image_url,
                plant_description: plant.description,
                is_favorite: isFavorited,
                is_liked: isLiked,
                created_at: created_at,
                plant: plant
            };
        });

        // 按创建时间排序
        favoritesData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // 缓存数据
        dataCache.favoritesData = {
            username: username,
            data: favoritesData
        };

        return favoritesData;
    } catch (error) {
        console.error('获取收藏数据失败:', error);
        return [];
    }
}

// 从Supabase获取通知数据
async function fetchNotifications(username) {
    try {
        // 检查缓存
        if (dataCache.notificationsData && dataCache.notificationsData.username === username) {
            return dataCache.notificationsData.data;
        }

        const {data: notifications, error} = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_username', username)
            .order('created_at', {ascending: false});

        if (error) throw error;

        // 缓存数据
        dataCache.notificationsData = {
            username: username,
            data: notifications || []
        };

        return dataCache.notificationsData.data;
    } catch (error) {
        console.error('获取通知数据失败:', error);
        // 返回模拟数据用于演示
        return getMockNotificationsData();
    }
}

// 模拟通知数据（实际使用时请删除）
function getMockNotificationsData() {
    return [

    ];
}

// 从Supabase获取对话数据
async function fetchConversations(username) {
    try {
        // 检查缓存
        if (dataCache.conversationsData && dataCache.conversationsData.username === username) {
            return dataCache.conversationsData.data;
        }

        const {data: conversations, error} = await supabase
            .from('conversations')
            .select('*')
            .or(`user1.eq.${username},user2.eq.${username}`)
            .order('last_message_at', {ascending: false});

        if (error) throw error;

        // 缓存数据
        dataCache.conversationsData = {
            username: username,
            data: conversations || []
        };

        return dataCache.conversationsData.data;
    } catch (error) {
        console.error('获取对话数据失败:', error);
        // 返回模拟数据用于演示
        return getMockConversationsData();
    }
}

// 模拟对话数据
function getMockConversationsData() {
    return [

    ];
}

// 从Supabase获取消息数据
async function fetchMessages(conversationId) {
    try {
        const {data: messages, error} = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', {ascending: true});

        if (error) throw error;

        return messages || [];
    } catch (error) {
        console.error('获取消息数据失败:', error);
        // 返回模拟数据用于演示
        return getMockMessagesData(conversationId);
    }
}

// 模拟消息数据（实际使用时请删除）
function getMockMessagesData(conversationId) {
    if (conversationId === 1) {
        return [

        ];
    } else if (conversationId === 2) {
        return [

        ];
    }
    return [];
}

// 加载用户数据 - 完整版
async function loadUserData(username, role) {
    try {
        console.log('开始加载用户数据，用户名:', username, '角色:', role);

        // 设置当前用户
        currentUser = username;

        // 并行获取用户数据、好友数据、作品数据、通知数据
        const [userFromDB, friends, works, notifications, friendRequests] = await Promise.all([
            fetchUserData(username),
            fetchFriendsData(username),
            fetchWorksData(username, role),
            fetchNotifications(username),
            // 获取好友申请数据
            (async () => {
                try {
                    const {data, error} = await supabase
                        .from('friend_requests')
                        .select('*')
                        .or(`sender_id.eq.${username},receiver_id.eq.${username}`)
                        .order('created_at', {ascending: false});

                    if (error) {
                        console.error('获取好友申请失败:', error);
                        return [];
                    }
                    return data || [];
                } catch (error) {
                    console.error('获取好友申请异常:', error);
                    return [];
                }
            })()
        ]);

        // 获取收藏点赞数据
        const favorites = await fetchUserFavorites(username);

        friendsData = friends;
        worksData = works;
        favoritesData = favorites || [];

        notificationsData = notifications;

        // 缓存点赞和收藏数据
        if (favoritesData && favoritesData.length > 0) {
            favoritesData.forEach(item => {
                if (item.is_liked) {
                    if (!plantLikesCache[item.plant_id]) {
                        plantLikesCache[item.plant_id] = [];
                    }
                    plantLikesCache[item.plant_id].push(username);
                }

                if (item.is_favorite) {
                    if (!plantFavoritesCache[item.plant_id]) {
                        plantFavoritesCache[item.plant_id] = [];
                    }
                    plantFavoritesCache[item.plant_id].push(username);
                }
            });
        }

        // 存储好友申请数据到全局变量
        window.friendRequestsData = friendRequests || [];


        if (username === '2785300881') {
            console.log('检测到2785300881用户，设置为超级管理员');
            userData = {
                id: 1,
                username: username,
                fullName: userFromDB.full_name||'超级管理员',
                email: username + '@qq.com',
                phone: '',
                department: userFromDB.department ||'系统管理部',
                studentId: userFromDB.student_id ||'ADMIN001',
                bio: userFromDB.bio ||'系统超级管理员，负责用户管理和系统维护。',
                role: 'super-admin',
                avatar: '',
                lastLogin: new Date().toLocaleString()
            };
        } else if (userFromDB) {
            // 使用数据库中的用户数据
            userData = {
                id: userFromDB.id,
                username: userFromDB.username,
                fullName: userFromDB.full_name || '用户 ' + userFromDB.username,
                email: userFromDB.email || ''+ '',
                phone: userFromDB.phone || '',
                department: userFromDB.department || '',
                studentId: userFromDB.student_id || '',
                bio: userFromDB.bio || '',
                role: userFromDB.role,
                avatar: userFromDB.avatar || '',
                lastLogin: userFromDB.last_login ? new Date(userFromDB.last_login).toLocaleString() : new Date().toLocaleString()
            };
        } else {
            // 使用默认数据
            const isSuperAdmin = username === '2785300881' && (role === 'admin' || role === 'super-admin');

            userData = {
                id: 1,
                username: username,
                fullName: isSuperAdmin ? '' : '用户 ' + username,
                email: username + 'qq.com',
                phone: '',
                department: isSuperAdmin ? '系统管理部' : '',
                studentId: isSuperAdmin ? 'ADMIN001' : '',
                bio: isSuperAdmin ? '一天更比一天好' : '热爱植物，喜欢探索校园中的各种植被。',
                role: isSuperAdmin ? 'super-admin' : (role || 'user'),
                avatar: '',
                lastLogin: new Date().toLocaleString()
            };
        }

        console.log('最终用户数据:', userData);

        // 更新用户信息显示
        updateUserInfo();

        // 检查权限并显示相应功能
        checkPermissions();

        // 计算未读通知和待处理好友申请总数
        const unreadNotifications = notifications.filter(n => !n.is_read).length;
        const pendingFriendRequests = friendRequests.filter(r =>
            r.receiver_id === username && r.status === 'pending'
        ).length;

        // 更新消息徽章
        updateMessagesBadge(unreadNotifications + pendingFriendRequests);

        // 初始化点赞、收藏、评论数据
        initPlantData();

        // 加载作品内容
        loadWorksContent();

        window.currentUserFriendRequests = friendRequests;

    } catch (error) {
        console.error('加载用户数据失败:', error);
    }
}

// 植物管理权限
function checkPermissions() {
    const allPlantsFilter = document.getElementById('allPlantsFilter');

    if (allPlantsFilter) {
        if (userData.role === 'admin' || userData.role === 'super-admin') {
            allPlantsFilter.style.display = 'block';
        } else {
            allPlantsFilter.style.display = 'none';
        }
    }
}

// 更新消息徽章
function updateMessagesBadge(count) {
    const messagesBadge = document.getElementById('messagesBadge');
    if (!messagesBadge) return;

    if (count > 0) {
        messagesBadge.textContent = count > 99 ? '99+' : count.toString();
        messagesBadge.style.display = 'inline-block';
    } else {
        messagesBadge.style.display = 'none';
    }
}

// 初始化植物互动数据
async function initPlantData() {
    try {
        const currentUser = localStorage.getItem('currentUser');

        for (const work of worksData) {
            const plantId = work.id;

            // 并行获取点赞、收藏、评论数量
            const [likeCount, favoriteCount, commentCount] = await Promise.all([
                getPlantLikeCount(plantId),
                getPlantFavoriteCount(plantId),
                getPlantCommentCount(plantId)
            ]);

            // 缓存数据
            if (!plantLikesCache[plantId]) {
                plantLikesCache[plantId] = [];
            }

            if (!plantFavoritesCache[plantId]) {
                plantFavoritesCache[plantId] = [];
            }

            // 如果当前用户已经点赞/收藏，添加到缓存
            if (currentUser) {
                // 从数据库获取最新数据
                const [userLikes, userFavorites] = await Promise.all([
                    fetchPlantLikes(plantId),
                    fetchPlantFavorites(plantId)
                ]);

                plantLikesCache[plantId] = userLikes.map(like => like.username);
                plantFavoritesCache[plantId] = userFavorites.map(fav => fav.username);
            }
        }
    } catch (error) {
        console.error('初始化植物数据失败:', error);
    }
}

// 更新用户信息显示
function updateUserInfo() {
    document.getElementById('userName').textContent = userData.fullName;
    document.getElementById('username').value = userData.username;
    document.getElementById('fullName').value = userData.fullName;
    document.getElementById('email').value = userData.email;
    document.getElementById('phone').value = userData.phone;
    document.getElementById('department').value = userData.department;
    document.getElementById('studentId').value = userData.studentId;
    document.getElementById('bio').value = userData.bio;
    document.getElementById('lastLogin').textContent = userData.lastLogin;

    // 更新角色徽章
    const roleBadge = document.getElementById('userRole');
    roleBadge.textContent = getRoleText(userData.role);
    roleBadge.className = 'role-badge ' + getRoleClass(userData.role);

    // 如果有头像，显示头像
    if (userData.avatar) {
        const avatarPreview = document.getElementById('avatarPreview');
        avatarPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = userData.avatar;
        img.className = 'avatar-preview';
        img.style.objectFit = 'cover';
        avatarPreview.appendChild(img);
    }
}

// 设置标签页切换
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            this.classList.add('active');
            const tabId = this.getAttribute('data-tab') + 'Tab';
            document.getElementById(tabId).classList.add('active');

            if (this.getAttribute('data-tab') === 'friends') {
                loadFriendsContent();
            }

            if (this.getAttribute('data-tab') === 'messages') {
                loadNotifications();
            }

            if (this.getAttribute('data-tab') === 'works') {
                resetWorksFilter();
                loadWorksContent();
            }

            if (this.getAttribute('data-tab') === 'favorites') {
                loadFavoritesContent();
            }
        });
    });
}

// 重置作品筛选状态函数
function resetWorksFilter() {
    // 重置筛选按钮状态
    const filterButtons = document.querySelectorAll('#worksTab .filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === 'my-plants') {
            btn.classList.add('active');
        }
    });

    // 重置搜索框
    const searchInput = document.getElementById('worksSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }

}

// 设置头像上传
function setupAvatarUpload() {
    const avatarInput = document.getElementById('avatarInput');
    const avatarUpload = document.querySelector('.avatar-upload'); // 注意：这里是整个上传区域，包括预览
    const avatarPreview = document.getElementById('avatarPreview');

    console.log('设置头像上传功能', {
        avatarInput: !!avatarInput,
        avatarUpload: !!avatarUpload,
        avatarPreview: !!avatarPreview
    });

    // 点击整个上传区域触发文件选择
    if (avatarUpload) {
        avatarUpload.addEventListener('click', function (e) {
            console.log('点击了头像上传区域');
            e.stopPropagation();
            avatarInput.click();
        });
    }

    // 也可以直接点击预览图
    if (avatarPreview) {
        avatarPreview.addEventListener('click', function (e) {
            console.log('点击了头像预览');
            e.stopPropagation();
            avatarInput.click();
        });
    }

    // 文件选择变化时处理
    avatarInput.addEventListener('change', function (e) {
        console.log('选择了文件', this.files);
        if (this.files && this.files[0]) {
            const file = this.files[0];
            const reader = new FileReader();

            reader.onload = function (e) {
                console.log('文件读取完成，开始更新头像');

                // 清除原有内容
                avatarPreview.innerHTML = '';

                // 创建图片元素
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'avatar-preview';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';

                avatarPreview.appendChild(img);
                userData.avatar = e.target.result;

                // 保存到 localStorage
                localStorage.setItem('userAvatar', e.target.result);

                // 更新主页头像
                updateMainPageAvatar(e.target.result);

                showSuccessMessage('头像更新成功！');

                // 更新数据库
                updateAvatarInSupabase(e.target.result);
            }

            reader.onerror = function (e) {
                console.error('读取文件失败:', e);
                alert('读取图片失败，请重试！');
            }

            reader.readAsDataURL(file);
        } else {
            console.log('没有选择文件');
        }
    });

    // 初始化时加载已保存的头像
    loadSavedAvatar();
}

// 加载已保存的头像
function loadSavedAvatar() {
    const savedAvatar = localStorage.getItem('userAvatar');
    const avatarPreview = document.getElementById('avatarPreview');
    const currentUser = localStorage.getItem('currentUser');

    if (savedAvatar && avatarPreview) {
        console.log('加载已保存的头像');

        // 清除原有内容
        avatarPreview.innerHTML = '';

        const img = document.createElement('img');
        img.src = savedAvatar;
        img.className = 'avatar-preview';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';

        avatarPreview.appendChild(img);
        userData.avatar = savedAvatar;
    } else {
        console.log('没有找到已保存的头像，显示默认头像');
        // 显示默认图标
        if (avatarPreview) {
            avatarPreview.innerHTML = '<i class="fa fa-user avatar-placeholder"></i>';
        }
    }
}

// 更新头像到 Supabase
async function updateAvatarInSupabase(avatarUrl) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.log('未找到当前用户，无法更新头像到数据库');
            return;
        }

        console.log('正在更新数据库头像，用户:', currentUser);

        const {data, error} = await supabase
            .from('users')
            .update({
                avatar: avatarUrl,
                updated_at: new Date().toISOString()
            })
            .eq('username', currentUser)
            .select();

        if (error) {
            console.error('更新头像到数据库失败:', error);
            throw error;
        }

        console.log('头像更新成功:', data);

        // 清除用户数据缓存，确保下次获取时包含新头像
        dataCache.userData = null;

        return data;
    } catch (error) {
        console.error('更新头像到数据库失败:', error);
    }
}

// 设置表单提交
function setupForms() {
    // 个人信息表单
    document.getElementById('profileForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const saveBtn = document.getElementById('saveProfileBtn');
        const saveText = document.getElementById('saveProfileText');

        // 显示加载状态
        saveBtn.disabled = true;
        saveText.textContent = '保存中...';

        try {
            // 更新用户数据
            userData.fullName = document.getElementById('fullName').value;
            userData.email = document.getElementById('email').value;
            userData.phone = document.getElementById('phone').value;
            userData.department = document.getElementById('department').value;
            userData.studentId = document.getElementById('studentId').value;
            userData.bio = document.getElementById('bio').value;

            // 保存到Supabase
            await updateUserProfile(userData);

            // 更新显示
            document.getElementById('userName').textContent = userData.fullName;

            showSuccessMessage('个人信息更新成功！');
        } catch (error) {
            console.error('更新个人信息失败:', error);
            alert('更新失败，请稍后重试！');
        } finally {
            // 恢复按钮状态
            saveBtn.disabled = false;
            saveText.textContent = '保存更改';
        }
    });

    // 密码修改表单
    document.getElementById('passwordForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const saveBtn = document.getElementById('savePasswordBtn');
        const saveText = document.getElementById('savePasswordText');

        // 显示加载状态
        saveBtn.disabled = true;
        saveText.textContent = '更改中...';

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
            alert('新密码和确认密码不一致！');
            // 恢复按钮状态
            saveBtn.disabled = false;
            saveText.textContent = '更改密码';
            return;
        }

        if (newPassword.length < 6) {
            alert('密码长度至少6位！');
            // 恢复按钮状态
            saveBtn.disabled = false;
            saveText.textContent = '更改密码';
            return;
        }

        try {
            await updateUserPassword(userData.username, currentPassword, newPassword);
            showSuccessMessage('密码修改成功！');
            document.getElementById('passwordForm').reset();
        } catch (error) {
            alert(error.message || '密码修改失败！');
        } finally {
            // 恢复按钮状态
            saveBtn.disabled = false;
            saveText.textContent = '更改密码';
        }
    });
}

// 设置按钮事件
function setupButtons() {
    // 个人信息取消按钮
    document.getElementById('cancelProfile').addEventListener('click', function () {
        updateUserInfo();
    });

    // 密码修改取消按钮
    document.getElementById('cancelPassword').addEventListener('click', function () {
        document.getElementById('passwordForm').reset();
    });

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', function () {
        console.log('退出登录按钮被点击');
        logout();
    });

    // 设置详情模态框关闭按钮
    document.getElementById('close-detail').addEventListener('click', function () {
        closeDetailPanel();
    });

    // 设置详情模态框外部点击关闭
    document.getElementById('specimen-detail').addEventListener('click', function (e) {
        if (e.target === this) {
            closeDetailPanel();
        }
    });

    // ESC键关闭详情模态框
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            const detailModal = document.getElementById('specimen-detail');
            if (detailModal.classList.contains('active')) {
                closeDetailPanel();
            }
        }
    });
}

// 关闭详情面板
function closeDetailPanel() {
    const detailModal = document.getElementById('specimen-detail');
    detailModal.classList.remove('active');
    document.body.style.overflow = '';
}

// 设置搜索功能
function setupSearch() {
}

// 加载好友内容
function loadFriendsContent(filter = 'all') {
    const container = document.getElementById('friendsContent');

    // 根据筛选条件过滤数据
    let filteredData = friendsData;
    if (filter === 'pinned') {
        filteredData = friendsData.filter(friend => friend.pinned);
    }

    if (filteredData.length === 0) {
        container.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-users"></i>
                    <h3 class="text-lg font-medium mb-2">暂无好友</h3>
                    <p class="text-gray-500">添加好友，一起探索校园植被吧！</p>
                </div>
            `;
        return;
    }

    // 创建好友网格
    let html = '<div class="friends-grid">';

    filteredData.forEach(friend => {
        html += `
                <div class="friend-card ${friend.pinned ? 'pinned' : ''}" data-id="${friend.id}">
                    ${friend.pinned ? '<div class="pin-badge"><i class="fa fa-thumb-tack"></i></div>' : ''}
                    <div class="friend-avatar">
                        ${friend.users.avatar ?
            `<img src="${friend.users.avatar}" alt="${friend.users.full_name}" class="friend-avatar">` :
            `<i class="fa fa-user fa-2x"></i>`
        }
                    </div>
                    <div class="friend-info">
                        <h3 class="friend-username">${friend.users.username}</h3>
                        <div class="friend-name">@${friend.users.full_name}</div>
                        <div class="friend-actions">
                            <div class="friend-action ${friend.pinned ? 'pin-action pinned' : 'pin-action'}" data-action="pin" data-id="${friend.id}">
                                <i class="fa ${friend.pinned ? 'fa-thumb-tack' : 'fa-thumb-tack'}"></i>
                                <span>${friend.pinned ? '取消置顶' : '置顶'}</span>
                            </div>
                            <div class="friend-action remove-action" data-action="remove" data-id="${friend.id}">
                                <i class="fa fa-times"></i>
                                <span>删除</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
    });

    html += '</div>';
    container.innerHTML = html;

    // 绑定好友操作事件
    document.querySelectorAll('.friend-action').forEach(btn => {
        btn.addEventListener('click', function () {
            const action = this.getAttribute('data-action');
            const id = parseInt(this.getAttribute('data-id'));
            handleFriendAction(id, action);
        });
    });
}

// 处理好友操作
async function handleFriendAction(id, action) {
    try {
        if (action === 'pin') {
            const friend = friendsData.find(f => f.id === id);
            if (friend) {
                friend.pinned = !friend.pinned;
                // 更新数据库
                await updateFriendPinStatus(id, friend.pinned);
                showSuccessMessage(friend.pinned ? '好友已置顶！' : '已取消置顶');
                loadFriendsContent();
            }
        } else if (action === 'remove') {
            if (confirm('确定要删除此好友吗？')) {
                // 从数据库删除好友关系
                await removeFriend(id);
                // 从本地数据中移除
                friendsData = friendsData.filter(f => f.id !== id);
                showSuccessMessage('好友已删除！');
                loadFriendsContent();
            }
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败，请稍后重试！');
    }
}

// 更新好友置顶状态
async function updateFriendPinStatus(friendId, pinned) {
    try {
        const {error} = await supabase
            .from('friends')
            .update({pinned: pinned})
            .eq('id', friendId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('更新好友置顶状态失败:', error);
        throw error;
    }
}

// 删除好友
async function removeFriend(friendId) {
    try {
        const {error} = await supabase
            .from('friends')
            .delete()
            .eq('id', friendId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('删除好友失败:', error);
        throw error;
    }
}

// 搜索用户
async function searchUsers(query) {
    const resultsContainer = document.getElementById('searchResults');
    const currentUser = localStorage.getItem('currentUser');

    if (!query.trim()) {
        resultsContainer.innerHTML = '<div class="text-center text-gray-500 py-4">请输入搜索关键词</div>';
        return;
    }

    try {
        const {data: friendRequests = [], error: requestError} = await supabase
            .from('friend_requests')
            .select('*')
            .or(`sender_id.eq.${currentUser},receiver_id.eq.${currentUser}`)
            .eq('status', 'pending');
        if (requestError) {
            console.error('获取好友申请失败:', requestError);
        }

        // 搜索用户
        const {data: users, error} = await supabase
            .from('users')
            .select('id, username, full_name, avatar')
            .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
            .limit(10);

        if (error) throw error;

        if (users.length === 0) {
            resultsContainer.innerHTML = '<div class="text-center text-gray-500 py-4">未找到相关用户</div>';
            return;
        }

        // 获取当前用户的好友列表
        const currentUsername = localStorage.getItem('currentUser');
        const {data: friends = [], error: friendsError} = await supabase
            .from('friends')
            .select('friend_id, users!friends_friend_id_fkey(*)')
            .eq('user_id', currentUsername);

        if (friendsError) {
            console.error('获取好友列表失败:', friendsError);
        }

        let html = '';
        users.forEach(user => {
            // 检查是否是自己
            if (user.username === currentUser) return;

            // 检查是否已经是好友
            const isFriend = friends.some(f => f.friend_id === user.id);

            // 检查是否已发送请求
            const sentRequest = friendRequests.some(r =>
                r.receiver_id === user.username && r.status === 'pending'
            );

            // 检查是否收到请求
            const receivedRequest = friendRequests.some(r =>
                r.sender_id === user.username && r.status === 'pending'
            );

            html += `
                <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50">
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3 overflow-hidden">
                            ${user.avatar ?
                `<img src="${user.avatar}" alt="${user.full_name}" class="w-full h-full object-cover">` :
                `<i class="fa fa-user text-gray-500"></i>`
            }
                        </div>
                        <div>
                            <div class="font-medium">${user.full_name || user.username}</div>
                            <div class="text-sm text-gray-500">@${user.username}</div>
                        </div>
                    </div>
                    <div>
                        ${getFriendStatusButton(user, isFriend, sentRequest, receivedRequest)}
                    </div>
                </div>
            `;
        });

        resultsContainer.innerHTML = html;

        // 修改按钮事件绑定：
        document.querySelectorAll('.add-friend-btn:not(:disabled)').forEach(btn => {
            btn.addEventListener('click', function () {
                const username = this.getAttribute('data-username');
                sendFriendRequest(username);
            });
        });

    } catch (error) {
        console.error('搜索用户失败:', error);
        resultsContainer.innerHTML = '<div class="text-center text-red-500 py-4">搜索失败，请稍后重试</div>';
    }
}

// 然后修改搜索用户结果显示中的按钮调用：
function getFriendStatusButton(user, isFriend, sentRequest, receivedRequest) {
    const currentUser = localStorage.getItem('currentUser');

    // 检查是否是自己
    if (user.username === currentUser) {
        return '<span class="text-gray-500 text-sm px-3 py-1 bg-gray-100 rounded">自己</span>';
    }

    // 检查是否已经是好友
    if (isFriend) {
        return '<button class="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm" disabled>已是好友</button>';
    }

    // 检查是否已发送请求
    if (sentRequest) {
        return '<button class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded text-sm" disabled>已发送</button>';
    }

    // 检查是否收到请求
    if (receivedRequest) {
        return '<button class="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm" disabled>待处理</button>';
    }

    // 可以发送好友请求
    return `
    <button class="btn-primary add-friend-btn px-3 py-1 text-sm"
            data-username="${user.username}">
        添加好友
    </button>
    `;
}

// 发送好友申请
async function sendFriendRequest(receiverUsername) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            alert('请先登录！');
            return;
        }

        // 检查是否是自己
        if (currentUser === receiverUsername) {
            alert('不能添加自己为好友！');
            return;
        }

        // 获取发送者信息
        const {data: senderData, error: senderError} = await supabase
            .from('users')
            .select('username, full_name, avatar')
            .eq('username', currentUser)
            .single();

        if (senderError) throw senderError;

        // 获取接收者信息
        const {data: receiverData, error: receiverError} = await supabase
            .from('users')
            .select('username, full_name, avatar')
            .eq('username', receiverUsername)
            .single();

        if (receiverError) throw receiverError;

        // 检查是否已存在待处理的请求
        const {data: existingRequest, error: checkError} = await supabase
            .from('friend_requests')
            .select('*')
            .or(`and(sender_id.eq.${currentUser},receiver_id.eq.${receiverUsername}),and(sender_id.eq.${receiverUsername},receiver_id.eq.${currentUser})`)
            .eq('status', 'pending')
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') throw checkError;

        if (existingRequest) {
            alert('已存在待处理的好友请求！');
            return;
        }

        // 检查是否已经是好友（需要查看friends表）
        const {data: existingFriend, error: friendCheckError} = await supabase
            .from('friends')
            .select('*')
            .or(`and(user_id.eq.${currentUser},friend_id.eq.${receiverUsername}),
                 and(user_id.eq.${receiverUsername},friend_id.eq.${currentUser})`)
            .maybeSingle();

        if (friendCheckError && friendCheckError.code !== 'PGRST116') throw friendCheckError;

        if (existingFriend) {
            alert('你们已经是好友了！');
            return;
        }

        // 发送好友申请
        const {data, error} = await supabase
            .from('friend_requests')
            .insert([{
                sender_id: currentUser,
                sender_name: senderData.full_name || currentUser,
                sender_avatar: senderData.avatar || '',
                receiver_id: receiverUsername,
                receiver_name: receiverData.full_name || receiverUsername,
                receiver_avatar: receiverData.avatar || '',
                status: 'pending',
                created_at: new Date().toISOString()
            }])
            .select();

        if (error) throw error;

        // 创建通知
        await createNotification({
            type: 'friend_request',
            sender_username: currentUser,
            sender_name: senderData.full_name || currentUser,
            sender_avatar: senderData.avatar || '',
            recipient_username: receiverUsername,
            recipient_name: receiverData.full_name || receiverUsername,
            message: `${senderData.full_name || currentUser} 向你发送了好友申请`,
            metadata: {
                friend_request_id: data[0].id,
                action_url: '#messages'
            },
            is_read: false
        });

        // 同时需要确保 createNotification 函数存在：
        async function createNotification(notificationData) {
            try {
                const {data, error} = await supabase
                    .from('notifications')
                    .insert([{
                        ...notificationData,
                        created_at: new Date().toISOString()
                    }]);

                if (error) throw error;
                return data;
            } catch (error) {
                console.error('创建通知失败:', error);
                return null;
            }
        }

        // 更新UI
        showSuccessMessage('好友申请已发送！');

        // 重新搜索刷新按钮状态
        const searchInput = document.getElementById('searchUserInput');
        if (searchInput && searchInput.value.trim()) {
            searchUsers(searchInput.value);
        }

    } catch (error) {
        console.error('发送好友申请失败:', error);
        alert('发送好友申请失败，请稍后重试！');
    }
}

// 加载作品内容
function loadWorksContent(filter = 'my-plants') {
    const container = document.getElementById('worksGrid');
    const noResults = document.getElementById('noWorksResults');
    const currentUser = localStorage.getItem('currentUser');

    // 根据筛选条件过滤数据
    let filteredData = worksData;
    if (filter === 'my-plants') {
        filteredData = worksData.filter(work => work.created_by === currentUser);
    } else if (filter === 'all-plants') {
        // 管理员可以查看所有植物
        filteredData = worksData;
    }

    if (filteredData.length === 0) {
        container.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');

    let html = '';

    filteredData.forEach(work => {
        const isOwn = work.created_by === currentUser;
        const canEdit = checkEditPermission(work, currentUser, userData.role);

        html += `
            <div class="bg-white rounded-xl overflow-hidden shadow-sm card-hover group plant-card">
                <div class="plant-image-container">
                    <img src="${work.image_url || 'https://images.unsplash.com/photo-1520412099551-62b6bafeb5bb?w=400&h=300&fit=crop'}" alt="${work.name}" class="plant-image">
                    <div class="plant-type-badge">${work.category || '未知'}</div>
                </div>
                <div class="plant-content">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="plant-name">${work.name}</h3>
                            <span class="plant-scientific">${work.scientific_name || ''}</span>
                        </div>
                    </div>
                    <p class="plant-description">${work.description || '暂无描述'}</p>
                    <div class="plant-meta">
                        <span class="plant-meta-item">
                            <i class="fa fa-map-marker"></i> ${work.location || '未知位置'}
                        </span>
                        <span class="plant-meta-item">
                            <i class="fa fa-user"></i> ${work.created_by || '未知用户'}
                        </span>
                        <span class="plant-detail-btn" data-plant-id="${work.id}">查看详情</span>
                    </div>
                </div>
                <!-- 点赞收藏评论区域 -->
                <div class="plant-actions">
                    <div class="plant-action-btn like ${plantLikesCache[work.id] && plantLikesCache[work.id].includes(currentUser) ? 'active' : ''}" data-plant-id="${work.id}">
                        <i class="fa fa-heart"></i>
                        <span class="like-count">${plantLikesCache[work.id] ? plantLikesCache[work.id].length : 0}</span>
                    </div>
                    <div class="plant-action-btn favorite ${plantFavoritesCache[work.id] && plantFavoritesCache[work.id].includes(currentUser) ? 'active' : ''}" data-plant-id="${work.id}">
                        <i class="fa fa-bookmark"></i>
                        <span class="favorite-count">${plantFavoritesCache[work.id] ? plantFavoritesCache[work.id].length : 0}</span>
                    </div>
                    <div class="plant-action-btn comment" data-plant-id="${work.id}">
                        <i class="fa fa-comment"></i>
                        <span class="comment-count">0</span>
                    </div>
                </div>
                ${canEdit ? `
                    <div class="p-3 border-t border-gray-100">
                        <div class="flex justify-end space-x-2">
                            <button class="text-blue-600 hover:text-blue-800 text-sm edit-plant-btn" data-id="${work.id}">
                                编辑
                            </button>
                            <button class="text-red-600 hover:text-red-800 text-sm delete-plant-btn" data-id="${work.id}">
                                删除
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    // 查看详情按钮事件
    container.querySelectorAll('.plant-detail-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const plantId = this.getAttribute('data-plant-id');
            if (plantId) {
                showPlantDetails(parseInt(plantId));
            }
        });
    });

    // 定编辑按钮事件
    container.querySelectorAll('.edit-plant-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const plantId = this.getAttribute('data-id');
            if (plantId) {
                console.log('编辑按钮被点击，植物ID:', plantId);
                openEditPlantModal(plantId);
            }
        });
    });

    // 删除按钮事件
    container.querySelectorAll('.delete-plant-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation(); // 防止事件冒泡
            const plantId = this.getAttribute('data-id');
            if (plantId) {
                console.log('删除按钮被点击，植物ID:', plantId);
                if (confirm('确定要删除此植物吗？此操作不可恢复。')) {
                    deletePlant(plantId);
                }
            }
        });
    });

    // 初始化点赞收藏评论功能
    initPlantActions();
}

// 检查编辑权限
function checkEditPermission(plant, currentUser, userRole) {
    console.log('检查编辑权限:', {
        plant: plant.name,
        createdBy: plant.created_by,
        currentUser,
        userRole
    });

    if (userRole === 'super-admin') {
        return true;
    } else if (userRole === 'admin') {
        // 管理员可以编辑所有普通用户的植物，但不能编辑其他管理员或超级管理员的植物
        return plant.created_by !== 'admin' && plant.created_by !== currentUser;
    } else {
        // 普通用户只能编辑自己的植物
        return plant.created_by === currentUser;
    }
}

// 过滤作品
function filterWorks(searchTerm) {
    const container = document.getElementById('worksGrid');
    const noResults = document.getElementById('noWorksResults');
    const currentUser = localStorage.getItem('currentUser');
    const activeFilter = document.querySelector('#worksTab .filter-btn.active').getAttribute('data-filter');

    // 根据筛选条件过滤数据
    let filteredData = worksData;
    if (activeFilter === 'my-plants') {
        filteredData = worksData.filter(work => work.created_by === currentUser);
    } else if (activeFilter === 'all-plants') {
        // 管理员可以查看所有植物
        filteredData = worksData;
    }

    // 根据搜索词进一步过滤
    if (searchTerm) {
        filteredData = filteredData.filter(work =>
            work.name.toLowerCase().includes(searchTerm) ||
            (work.scientific_name && work.scientific_name.toLowerCase().includes(searchTerm)) ||
            (work.family && work.family.toLowerCase().includes(searchTerm)) ||
            (work.description && work.description.toLowerCase().includes(searchTerm))
        );
    }

    if (filteredData.length === 0) {
        container.innerHTML = '';
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');

    // 重新渲染作品网格
    let html = '';

    filteredData.forEach(work => {
        const isOwn = work.created_by === currentUser;
        const canEdit = checkEditPermission(work, currentUser, userData.role);

        html += `
            <div class="bg-white rounded-xl overflow-hidden shadow-sm card-hover group plant-card">
                <div class="plant-image-container">
                    <img src="${work.image_url || 'https://images.unsplash.com/photo-1520412099551-62b6bafeb5bb?w=400&h=300&fit=crop'}" alt="${work.name}" class="plant-image">
                    <div class="plant-type-badge">${work.category || '未知'}</div>
                </div>
                <div class="plant-content">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="plant-name">${work.name}</h3>
                            <span class="plant-scientific">${work.scientific_name || ''}</span>
                        </div>
                    </div>
                    <p class="plant-description">${work.description || '暂无描述'}</p>
                    <div class="plant-meta">
                        <span class="plant-meta-item">
                            <i class="fa fa-map-marker"></i> ${work.location || '未知位置'}
                        </span>
                        <span class="plant-meta-item">
                            <i class="fa fa-user"></i> ${work.created_by || '未知用户'}
                        </span>
                        <span class="plant-detail-btn" data-plant-id="${work.id}">查看详情</span>
                    </div>
                </div>
                <!-- 点赞收藏评论区域 -->
                <div class="plant-actions">
                    <div class="plant-action-btn like ${plantLikesCache[work.id] && plantLikesCache[work.id].includes(currentUser) ? 'active' : ''}" data-plant-id="${work.id}">
                        <i class="fa fa-heart"></i>
                        <span class="like-count">${plantLikesCache[work.id] ? plantLikesCache[work.id].length : 0}</span>
                    </div>
                    <div class="plant-action-btn favorite ${plantFavoritesCache[work.id] && plantFavoritesCache[work.id].includes(currentUser) ? 'active' : ''}" data-plant-id="${work.id}">
                        <i class="fa fa-bookmark"></i>
                        <span class="favorite-count">${plantFavoritesCache[work.id] ? plantFavoritesCache[work.id].length : 0}</span>
                    </div>
                    <div class="plant-action-btn comment" data-plant-id="${work.id}">
                        <i class="fa fa-comment"></i>
                        <span class="comment-count">0</span>
                    </div>
                </div>
                ${canEdit ? `
                    <div class="p-3 border-t border-gray-100">
                        <div class="flex justify-end space-x-2">
                            <button class="text-blue-600 hover:text-blue-800 text-sm edit-plant-btn" data-id="${work.id}">
                                编辑
                            </button>
                            <button class="text-red-600 hover:text-red-800 text-sm delete-plant-btn" data-id="${work.id}">
                                删除
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    // 查看详情按钮事件
    container.querySelectorAll('.plant-detail-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const plantId = this.getAttribute('data-plant-id');
            if (plantId) {
                showPlantDetails(parseInt(plantId));
            }
        });
    });

    // 绑定编辑按钮事件
    container.querySelectorAll('.edit-plant-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const plantId = this.getAttribute('data-id');
            if (plantId) {
                console.log('编辑按钮被点击，植物ID:', plantId);
                openEditPlantModal(plantId);
            }
        });
    });

    // 绑定删除按钮事件
    container.querySelectorAll('.delete-plant-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const plantId = this.getAttribute('data-id');
            if (plantId) {
                console.log('删除按钮被点击，植物ID:', plantId);
                if (confirm('确定要删除此植物吗？此操作不可恢复。')) {
                    deletePlant(plantId);
                }
            }
        });
    });

    // 重新初始化点赞收藏评论功能
    initPlantActions();
}

// 显示植物详情
function showPlantDetails(plantId) {

    let plant = worksData.find(p => p.id == plantId);

    if (!plant) {
        const favoriteItem = favoritesData.find(f => f.plant_id == plantId);
        if (favoriteItem) {
            plant = favoriteItem.plant;
        }
    }

    if (!plant) return;

    document.getElementById('detail-title').textContent = plant.name;
    document.getElementById('detail-subtitle').textContent = plant.scientific_name || '-';
    document.getElementById('info-family').textContent = plant.family || '-';
    document.getElementById('info-genus').textContent = plant.genus || '-';
    document.getElementById('info-distribution').textContent = plant.location || '-';
    document.getElementById('info-environment').textContent = plant.environment || '-';
    document.getElementById('info-collection-date').textContent = plant.created_at ? new Date(plant.created_at).toLocaleDateString() : '-';
    document.getElementById('info-created-by').textContent = plant.created_by || '未知';

    const mainImage = plant.image_url || '';
    document.getElementById('detail-image').src = mainImage;
    document.getElementById('detail-image').alt = plant.name;

    document.getElementById('info-description').textContent = plant.description || '-';

    // 显示植物详情模态框
    const detailModal = document.getElementById('specimen-detail');
    detailModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 设置图片点击放大功能
    setupDetailImagePreview();

    // 确保地图容器存在且可见后再初始化地图
    setTimeout(() => {
        if (plant.longitude && plant.latitude) {
            initPlantMap(plant);
        } else {
            // 如果没有经纬度，显示一个默认的地图视图
            initDefaultMap();
        }

        // 添加模态框显示后的地图调整
        setTimeout(() => {
            adjustMapAfterModalShow();
        }, 100);
    }, 100);
}

// 新增：模态框显示后调整地图
function adjustMapAfterModalShow() {
    const mapContainer = document.getElementById('mini-map');
    if (!mapContainer) return;

    // 确保地图容器有正确的高度
    mapContainer.style.height = '400px';
    mapContainer.style.minHeight = '400px';

    // 检查是否有地图实例并重新调整尺寸
    setTimeout(() => {
        if (window.mapInstance) {
            try {
                window.mapInstance.checkResize();
            } catch (e) {
                console.warn('地图调整尺寸时出错:', e);
            }
        }
    }, 200);
}

// 默认地图初始化
function initDefaultMap() {
    try {
        const mapContainer = document.getElementById('mini-map');
        if (!mapContainer) return;

        // 清空地图容器
        mapContainer.innerHTML = '';

        // 设置容器样式
        mapContainer.style.cssText = `
            width: 100%;
            height: 400px;
            min-height: 400px;
            position: relative;
            background-color: #f8f9fa;
        `;

        // 创建地图实例
        const map = new BMap.Map("mini-map");
        window.mapInstance = map;

        const campusCenter = new BMap.Point(119.053194, 33.558272);
        map.centerAndZoom(campusCenter, 17);

        map.enableScrollWheelZoom(true);
        map.enableDoubleClickZoom(true);

        map.addControl(new BMap.NavigationControl({
            type: BMAP_NAVIGATION_CONTROL_ZOOM,
            anchor: BMAP_ANCHOR_TOP_LEFT,
            offset: new BMap.Size(10, 10)
        }));

        map.addControl(new BMap.ScaleControl({
            anchor: BMAP_ANCHOR_BOTTOM_LEFT
        }));

        // 确保地图正确渲染
        setTimeout(() => {
            if (map.checkResize) {
                map.checkResize();
            }
            setTimeout(() => {
                if (map.checkResize) {
                    map.checkResize();
                }
            }, 300);
        }, 300);

        console.log('默认地图初始化完成');

        window.addEventListener('resize', function handleResize() {
            setTimeout(() => {
                if (map && map.checkResize) {
                    map.checkResize();
                }
            }, 100);
        });

        map.addEventListener('load', function () {
            setTimeout(() => {
                if (map.checkResize) {
                    map.checkResize();
                }
            }, 500);
        });

    } catch (error) {
        console.error('初始化默认地图失败:', error);
        const mapContainer = document.getElementById('mini-map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666; height: 400px; display: flex; align-items: center; justify-content: center;">
                    <div>
                        <i class="fa fa-map fa-2x" style="margin-bottom: 10px;"></i>
                        <p style="margin: 0;">地图加载失败</p>
                    </div>
                </div>
            `;
        }
    }
}

// 初始化植物地图
function initPlantMap(plant) {
    try {
        console.log('初始化植物地图，植物数据:', plant);

        // 获取地图容器
        const mapContainer = document.getElementById('mini-map');
        if (!mapContainer) {
            console.error('地图容器未找到');
            return;
        }

        // 清空地图容器
        mapContainer.innerHTML = '';

        // 确保地图容器有正确的尺寸和样式
        mapContainer.style.cssText = `
            width: 100%;
            height: 400px;
            min-height: 400px;
            position: relative;
            background-color: #f8f9fa;
        `;

        // 创建地图实例
        const map = new BMap.Map("mini-map");

        // 保存地图实例到全局变量
        window.mapInstance = map;

        const campusCenter = new BMap.Point(119.053194, 33.558272);
        map.centerAndZoom(campusCenter, 17);

        // 启用滚轮缩放
        map.enableScrollWheelZoom(true);

        // 添加双击缩放
        map.enableDoubleClickZoom(true);

        // 添加必要的控件
        map.addControl(new BMap.NavigationControl({
            type: BMAP_NAVIGATION_CONTROL_ZOOM,
            anchor: BMAP_ANCHOR_TOP_LEFT,
            offset: new BMap.Size(10, 10)
        }));

        // 添加比例尺
        map.addControl(new BMap.ScaleControl({
            anchor: BMAP_ANCHOR_BOTTOM_LEFT
        }));

        // 如果植物有坐标，在地图上添加标记点
        if (plant.longitude && plant.latitude) {
            const plantPoint = new BMap.Point(plant.longitude, plant.latitude);
            const marker = new BMap.Marker(plantPoint);
            map.addOverlay(marker);

            // 添加跳动动画
            marker.setAnimation(BMAP_ANIMATION_BOUNCE);

            // 将地图中心移动到植物位置
            map.panTo(plantPoint);
        }

        // 确保地图正确渲染
        setTimeout(() => {
            if (map.checkResize) {
                map.checkResize();
            }
            // 第二次检查确保地图完全渲染
            setTimeout(() => {
                if (map.checkResize) {
                    map.checkResize();
                }
            }, 300);
        }, 300);

        console.log('地图初始化完成');

        // 添加窗口大小变化监听
        window.addEventListener('resize', function handleResize() {
            setTimeout(() => {
                if (map && map.checkResize) {
                    map.checkResize();
                }
            }, 100);
        });

        // 为当前地图实例添加resize监听器
        map.addEventListener('load', function () {
            setTimeout(() => {
                if (map.checkResize) {
                    map.checkResize();
                }
            }, 500);
        });

    } catch (error) {
        console.error('初始化地图失败:', error);
        const mapContainer = document.getElementById('mini-map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="padding: 15px; background: #f5f5f5; border-radius: 4px; height: 400px; display: flex; align-items: center; justify-content: center;">
                    <div style="text-align: center;">
                        <div style="color: #2E7D32; margin-bottom: 10px;">
                            <i class="fa fa-map-marker fa-2x"></i>
                        </div>
                        <div style="font-weight: bold; margin-bottom: 5px;">${plant.name}</div>
                        ${plant.longitude && plant.latitude ? `
                        <div style="font-family: monospace; font-size: 12px; color: #666;">
                            经纬度: ${plant.longitude.toFixed(6)}, ${plant.latitude.toFixed(6)}
                        </div>
                        ` : ''}
                        <div style="color: #999; font-size: 12px; margin-top: 10px;">
                            地图加载失败，请刷新重试
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// 关闭详情面板时清理地图
function closeDetailPanel() {
    const detailModal = document.getElementById('specimen-detail');
    detailModal.classList.remove('active');
    document.body.style.overflow = '';

    // 清理地图资源和全局实例
    if (window.mapInstance) {
        try {
            window.mapInstance.destroy();
        } catch (e) {
            console.warn('清理地图实例时出现警告:', e);
        }
        window.mapInstance = null;
    }

    // 清理地图容器
    const mapContainer = document.getElementById('mini-map');
    if (mapContainer) {
        mapContainer.innerHTML = '';
    }
}

// 设置详情图片预览功能
function setupDetailImagePreview() {
    const detailImageContainer = document.getElementById('detail-image-container');
    const detailImage = document.getElementById('detail-image');
    const detailImagePreview = document.getElementById('detail-image-preview');
    const detailImagePreviewImg = document.getElementById('detail-image-preview-img');
    const detailImagePreviewClose = document.getElementById('detail-image-preview-close');

    detailImageContainer.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetailImagePreview(detailImage.src);
    });

    detailImage.addEventListener('click', function (e) {
        e.stopPropagation();
        openDetailImagePreview(this.src);
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

    function openDetailImagePreview(imageSrc) {
        detailImagePreviewImg.src = imageSrc;
        detailImagePreview.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeDetailImagePreview() {
        detailImagePreview.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// 删除植物
async function deletePlant(plantId) {
    if (confirm('确定要删除此植物吗？此操作不可恢复。')) {
        try {
            const {error} = await supabase
                .from('plants')
                .delete()
                .eq('id', plantId);

            if (error) throw error;

            // 从本地数据中移除
            worksData = worksData.filter(work => work.id !== plantId);

            showSuccessMessage('植物删除成功！');
            loadWorksContent();
        } catch (error) {
            console.error('删除植物失败:', error);
            alert('删除失败，请稍后重试！');
        }
    }
}

// 初始化点赞收藏评论功能
function initPlantActions() {
    const currentUser = localStorage.getItem('currentUser');

    if (!currentUser) {
        console.log('用户未登录，植物互动功能受限');
        return;
    }

    // 使用事件委托处理点赞收藏点击
    document.addEventListener('click', async function (event) {
        // 点赞按钮点击
        if (event.target.closest('.plant-action-btn.like')) {
            const btn = event.target.closest('.plant-action-btn.like');
            const plantId = btn.getAttribute('data-plant-id');
            const span = btn.querySelector('.like-count');

            if (plantId && span) {
                event.preventDefault();
                event.stopPropagation();
                await handlePlantLikeAction(plantId, btn, span);
            }
        }

        // 收藏按钮点击
        else if (event.target.closest('.plant-action-btn.favorite')) {
            const btn = event.target.closest('.plant-action-btn.favorite');
            const plantId = btn.getAttribute('data-plant-id');
            const span = btn.querySelector('.favorite-count');

            if (plantId && span) {
                event.preventDefault();
                event.stopPropagation();
                await handlePlantFavoriteAction(plantId, btn, span);
            }
        }

        // 评论按钮点击
        else if (event.target.closest('.plant-action-btn.comment')) {
            const btn = event.target.closest('.plant-action-btn.comment');
            const plantId = parseInt(btn.getAttribute('data-plant-id'));

            if (plantId) {
                event.preventDefault();
                event.stopPropagation();

                // 检查是否登录
                const currentUser = localStorage.getItem('currentUser');
                if (!currentUser) {
                    alert('请先登录才能评论！');
                    window.location.href = 'login.html';
                    return;
                }

                // 直接调用函数，不通过 onclick
                openPlantCommentDrawer(plantId);
            }
        }
    });
    document.addEventListener('click', function (event) {
        if (event.target.closest('.close-plant-comment')) {
            const closeBtn = event.target.closest('.close-plant-comment');
            const plantId = closeBtn.getAttribute('data-plant-id');
            closePlantCommentDrawer(plantId);
        }
    });
    // 初始化显示计数
    updatePlantInteractionCounts();
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

// 检查用户是否点赞了植物
async function checkIfUserLikedPlant(plantId, username) {
    if (!username) return false;

    try {
        const {data, error} = await supabase
            .from('plant_likes')
            .select('id')
            .eq('plant_id', plantId)
            .eq('username', username)
            .maybeSingle(); // 使用 maybeSingle 而不是 single

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
            .maybeSingle(); // 使用 maybeSingle 而不是 single

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

// 处理植物点赞操作
async function handlePlantLikeAction(plantId, button, countSpan) {
    // 防止重复点击
    if (isUpdatingLike[plantId]) return;
    isUpdatingLike[plantId] = true;

    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            alert('请先登录');
            window.location.href = 'login.html';
            isUpdatingLike[plantId] = false;
            return;
        }

        // 检查当前点赞状态
        const isLiked = button.classList.contains('active');
        const plant = worksData.find(p => p.id == plantId);

        // 立即更新UI状态，避免闪烁
        if (isLiked) {
            button.classList.remove('active');
            const currentCount = parseInt(countSpan.textContent) || 0;
            countSpan.textContent = Math.max(0, currentCount - 1);
        } else {
            button.classList.add('active');
            const currentCount = parseInt(countSpan.textContent) || 0;
            countSpan.textContent = currentCount + 1;
        }

        if (isLiked) {
            // 取消点赞
            const {error} = await supabase
                .from('plant_likes')
                .delete()
                .eq('plant_id', plantId)
                .eq('username', currentUser);

            if (error && error.code !== 'PGRST116') {
                console.error('取消点赞失败:', error);
                // 如果失败，回退UI状态
                button.classList.add('active');
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = currentCount + 1;
                throw error;
            }

            // 更新本地收藏数据
            const favIndex = favoritesData.findIndex(f => f.plant_id == plantId);
            if (favIndex !== -1) {
                favoritesData[favIndex].is_liked = false;
                // 如果既没点赞也没收藏，从列表中移除
                if (!favoritesData[favIndex].is_liked && !favoritesData[favIndex].is_favorite) {
                    favoritesData.splice(favIndex, 1);
                }
            }

            showSuccessMessage('已取消点赞');

        } else {
            // 点赞 - 使用upsert
            const {error} = await supabase
                .from('plant_likes')
                .upsert({
                    plant_id: plantId,
                    username: currentUser,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'plant_id,username'
                });

            if (error) {
                console.error('点赞失败:', error);
                // 如果失败，回退UI状态
                button.classList.remove('active');
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = Math.max(0, currentCount - 1);
                throw error;
            }

            // 更新本地收藏数据
            const favIndex = favoritesData.findIndex(f => f.plant_id == plantId);
            if (favIndex !== -1) {
                favoritesData[favIndex].is_liked = true;
            } else if (plant) {
                // 添加到收藏数据中
                favoritesData.push({
                    id: plantId,
                    plant_id: plantId,
                    plant_name: plant.name,
                    plant_image: plant.image_url,
                    plant_description: plant.description,
                    is_favorite: false,
                    is_liked: true,
                    created_at: new Date().toISOString(),
                    plant: plant
                });
            }

            // 添加动画效果
            button.querySelector('i').style.animation = 'none';
            setTimeout(() => {
                button.querySelector('i').style.animation = 'heartbeat 0.6s ease-in-out';
            }, 10);

            showSuccessMessage('点赞成功！');
        }

        // 更新所有页面的计数显示
        updatePlantInteractionCounts();
        // 刷新收藏列表显示
        loadFavoritesContent();

    } catch (error) {
        console.error('点赞操作失败:', error);
        alert('操作失败，请稍后重试');
    } finally {
        isUpdatingLike[plantId] = false;
    }
}

// 处理植物收藏操作
async function handlePlantFavoriteAction(plantId, button, countSpan) {
    // 防止重复点击
    if (isUpdatingFavorite[plantId]) return;
    isUpdatingFavorite[plantId] = true;

    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            alert('请先登录');
            window.location.href = 'login.html';
            isUpdatingFavorite[plantId] = false;
            return;
        }

        // 检查当前收藏状态
        const isFavorited = button.classList.contains('active');
        const plant = worksData.find(p => p.id == plantId);

        // 立即更新UI状态，避免闪烁
        if (isFavorited) {
            button.classList.remove('active');
            const currentCount = parseInt(countSpan.textContent) || 0;
            countSpan.textContent = Math.max(0, currentCount - 1);
        } else {
            button.classList.add('active');
            const currentCount = parseInt(countSpan.textContent) || 0;
            countSpan.textContent = currentCount + 1;
        }

        if (isFavorited) {
            // 取消收藏
            const {error} = await supabase
                .from('plant_favorites')
                .delete()
                .eq('plant_id', plantId)
                .eq('username', currentUser);

            if (error && error.code !== 'PGRST116') {
                console.error('取消收藏失败:', error);
                // 如果失败，回退UI状态
                button.classList.add('active');
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = currentCount + 1;
                throw error;
            }

            // 更新本地收藏数据
            const favIndex = favoritesData.findIndex(f => f.plant_id == plantId);
            if (favIndex !== -1) {
                favoritesData[favIndex].is_favorite = false;
                // 如果既没点赞也没收藏，从列表中移除
                if (!favoritesData[favIndex].is_liked && !favoritesData[favIndex].is_favorite) {
                    favoritesData.splice(favIndex, 1);
                }
            }

            showSuccessMessage('已取消收藏');

        } else {
            // 收藏 - 使用upsert
            const {error} = await supabase
                .from('plant_favorites')
                .upsert({
                    plant_id: plantId,
                    username: currentUser,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'plant_id,username'
                });

            if (error) {
                console.error('收藏失败:', error);
                // 如果失败，回退UI状态
                button.classList.remove('active');
                const currentCount = parseInt(countSpan.textContent) || 0;
                countSpan.textContent = Math.max(0, currentCount - 1);
                throw error;
            }

            // 更新本地收藏数据
            const favIndex = favoritesData.findIndex(f => f.plant_id == plantId);
            if (favIndex !== -1) {
                favoritesData[favIndex].is_favorite = true;
            } else if (plant) {
                // 添加到收藏数据中
                favoritesData.push({
                    id: plantId,
                    plant_id: plantId,
                    plant_name: plant.name,
                    plant_image: plant.image_url,
                    plant_description: plant.description,
                    is_favorite: true,
                    is_liked: false,
                    created_at: new Date().toISOString(),
                    plant: plant
                });
            }

            // 添加动画效果
            button.querySelector('i').style.animation = 'none';
            setTimeout(() => {
                button.querySelector('i').style.animation = 'bookmark-pulse 0.5s ease-in-out';
            }, 10);

            showSuccessMessage('收藏成功！');
        }

        // 更新所有页面的计数显示
        updatePlantInteractionCounts();
        // 刷新收藏列表显示
        loadFavoritesContent();

    } catch (error) {
        console.error('收藏操作失败:', error);
        alert('操作失败，请稍后重试');
    } finally {
        isUpdatingFavorite[plantId] = false;
    }
}

// 加载收藏点赞内容
function loadFavoritesContent(filter = 'all') {
    const container = document.getElementById('favoritesContent');

    // 根据筛选条件过滤数据
    let filteredData = favoritesData;
    if (filter === 'likes') {
        filteredData = favoritesData.filter(item => item.is_liked);
    } else if (filter === 'favorites') {
        filteredData = favoritesData.filter(item => item.is_favorite);
    }

    if (filteredData.length === 0) {
        container.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-heart"></i>
                    <h3 class="text-lg font-medium mb-2">暂无点赞或收藏</h3>
                    <p class="text-gray-500">您还没有点赞或收藏任何植物，快去探索校园植被吧！</p>
                </div>
            `;
        return;
    }

    // 创建收藏网格
    let html = '<div class="favorites-grid">';

    filteredData.forEach(item => {
        const plant = item.plant || worksData.find(p => p.id == item.plant_id);
        if (!plant) return;

        // 构建标签显示
        let tagsHtml = '';
        if (item.is_liked) {
            tagsHtml += '<span class="favorite-tag liked">已点赞</span>';
        }
        if (item.is_favorite) {
            tagsHtml += '<span class="favorite-tag favorited">已收藏</span>';
        }

        html += `
                <div class="plant-card">
                    <div class="plant-image-container">
                        <img src="${plant.image_url || 'https://images.unsplash.com/photo-1520412099551-62b6bafeb5bb?w=400&h=300&fit=crop'}" alt="${plant.name}" class="plant-image">
                        <div class="plant-type-badge">${plant.category || '未知'}</div>
                    </div>
                    <div class="plant-content">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h3 class="plant-name">${plant.name}</h3>
                                <span class="plant-scientific">${plant.scientific_name || ''}</span>
                            </div>
                        </div>
                        <p class="plant-description">${plant.description || '暂无描述'}</p>
                        <div class="plant-meta">
                            <span class="plant-meta-item">
                                <i class="fa fa-map-marker"></i> ${plant.location || '未知位置'}
                            </span>
                            <span class="plant-meta-item">
                                <i class="fa fa-user"></i> ${plant.created_by || '未知用户'}
                            </span>
                            <span class="plant-detail-btn" onclick="showPlantDetails(${plant.id})">查看详情</span>
                        </div>
                        ${tagsHtml ? `<div class="favorite-tags">${tagsHtml}</div>` : ''}
                    </div>
                    <!-- 点赞收藏评论区域 -->
                    <div class="plant-actions">
                        <div class="plant-action-btn like ${item.is_liked ? 'active' : ''}" data-plant-id="${plant.id}">
                            <i class="fa fa-heart"></i>
                            <span class="like-count">${plantLikesCache[plant.id] ? plantLikesCache[plant.id].length : 0}</span>
                        </div>
                        <div class="plant-action-btn favorite ${item.is_favorite ? 'active' : ''}" data-plant-id="${plant.id}">
                            <i class="fa fa-bookmark"></i>
                            <span class="favorite-count">${plantFavoritesCache[plant.id] ? plantFavoritesCache[plant.id].length : 0}</span>
                        </div>
                        <div class="plant-action-btn comment" data-plant-id="${plant.id}">
                            <i class="fa fa-comment"></i>
                            <span class="comment-count">0</span>
                        </div>
                    </div>
                </div>
            `;
    });

    html += '</div>';
    container.innerHTML = html;

    // 绑定查看详情按钮事件
    document.querySelectorAll('.plant-detail-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const plantId = this.parentElement.querySelector('.plant-detail-btn').getAttribute('onclick').match(/\d+/)[0];
            showPlantDetails(parseInt(plantId));
        });
    });

    // 重新绑定点赞收藏评论事件
    initPlantActions();
}

// 辅助函数
function getRoleText(role) {
    switch (role) {
        case 'super-admin':
            return '超级管理员';
        case 'admin':
            return '管理员';
        case 'user':
            return '普通用户';
        default:
            return role;
    }
}

function getRoleClass(role) {
    switch (role) {
        case 'super-admin':
            return 'role-super-admin';
        case 'admin':
            return 'role-admin';
        case 'user':
            return 'role-user';
        default:
            return 'role-user';
    }
}

// 显示成功消息
function showSuccessMessage(message) {
    const successMessage = document.getElementById('successMessage');
    const successText = document.getElementById('successText');
    successText.textContent = message;

    successMessage.classList.add('show');

    setTimeout(() => {
        successMessage.classList.remove('show');
    }, 3000);
}

// 更新用户资料到 Supabase
async function updateUserProfile(userData) {
    try {
        const {data, error} = await supabase
            .from('users')
            .update({
                full_name: userData.fullName,
                email: userData.email,
                phone: userData.phone,
                department: userData.department,
                student_id: userData.studentId,
                bio: userData.bio,
                updated_at: new Date().toISOString()
            })
            .eq('username', userData.username);

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('更新用户资料失败:', error);
        throw error;
    }
}

// 更新用户密码
async function updateUserPassword(username, currentPassword, newPassword) {
    try {
        const {data, error} = await supabase
            .from('users')
            .update({
                password: newPassword,
                updated_at: new Date().toISOString()
            })
            .eq('username', username);

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('更新密码失败:', error);
        throw error;
    }
}

// 更新主页头像
function updateMainPageAvatar(avatarUrl) {
    // 更新主页的头像显示（如果有的话）
    const mainPageAvatar = document.getElementById('mainAvatar');
    if (mainPageAvatar) {
        mainPageAvatar.src = avatarUrl;
    }
}

// 退出登录
function logout() {
    console.log('执行退出登录');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userAvatar');

    // 清除所有缓存数据
    dataCache = {
        userData: null,
        friendsData: null,
        worksData: null,
        favoritesData: null,
        plantsCount: null,
        notificationsData: null,
        conversationsData: null
    };

    // 重定向到登录页
    window.location.href = 'login.html';
}

// 加载通知
async function loadNotifications() {
    const container = document.querySelector('.notifications-list');
    if (!container) return;

    try {
        const notifications = await fetchNotifications(userData.username);

        if (notifications.length === 0) {
            container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa fa-bell"></i>
                        <h3 class="text-lg font-medium mb-2">暂无通知</h3>
                        <p class="text-gray-500">当有人评论您的植物时，您会收到通知</p>
                    </div>
                `;
            return;
        }

        let html = '';
        notifications.forEach(notification => {
            html += `
                    <div class="notification-item ${!notification.is_read ? 'unread' : ''}">
                        <div class="notification-avatar">
                            <i class="fa fa-user"></i>
                        </div>
                        <div class="notification-content">
                            <div class="notification-text">
                                <strong>${notification.sender_name}</strong> ${notification.message}
                                ${notification.plant_name ? ` - "${notification.plant_name}"` : ''}
                            </div>
                            <div class="notification-time">
                                ${formatTime(notification.created_at)}
                            </div>
                            ${!notification.is_read ? `
                                <div class="notification-actions">
                                    <div class="notification-action">标记为已读</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('加载通知失败:', error);
    }
}

// 加载对话
async function loadConversations() {
    const container = document.querySelector('.conversations-list');
    if (!container) return;

    try {
        const conversations = await fetchConversations(userData.username);

        if (conversations.length === 0) {
            container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa fa-comments"></i>
                        <h3 class="text-lg font-medium mb-2">暂无对话</h3>
                        <p class="text-gray-500">选择用户开始聊天</p>
                    </div>
                `;
            return;
        }

        let html = '';
        conversations.forEach(conversation => {
            const otherUser = conversation.user1 === userData.username ? conversation.user2 : conversation.user1;
            const otherUserName = conversation.user1 === userData.username ? conversation.user2_name : conversation.user1_name;

            html += `
                    <div class="conversation-item" data-id="${conversation.id}">
                        <div class="conversation-header">
                            <div class="conversation-name">${otherUserName}</div>
                            <div class="conversation-time">${formatTime(conversation.last_message_at)}</div>
                        </div>
                        <div class="conversation-preview">${conversation.last_message}</div>
                        ${conversation.unread_count > 0 ? `<div class="unread-badge">${conversation.unread_count}</div>` : ''}
                    </div>
                `;
        });

        container.innerHTML = html;

        // 绑定对话点击事件
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', function () {
                const conversationId = this.getAttribute('data-id');
                openConversation(conversationId);
            });
        });
    } catch (error) {
        console.error('加载对话失败:', error);
    }
}

// 打开对话
async function openConversation(conversationId) {
    currentConversationId = conversationId;

    // 更新UI
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-id') == conversationId) {
            item.classList.add('active');
        }
    });

    // 显示聊天区域
    const chatHeader = document.querySelector('.chat-header');
    const chatInputArea = document.querySelector('.chat-input-area');
    const chatMessages = document.querySelector('.chat-messages');

    // 更新聊天头部
    const activeConversation = document.querySelector('.conversation-item.active');
    if (activeConversation) {
        const userName = activeConversation.querySelector('.conversation-name').textContent;
        chatHeader.innerHTML = `<h3 class="text-lg font-medium">${userName}</h3>`;
    }

    // 显示输入区域
    chatInputArea.style.display = 'block';

    // 加载消息
    try {
        const messages = await fetchMessages(conversationId);

        if (messages.length === 0) {
            chatMessages.innerHTML = `
                    <div class="empty-state">
                        <i class="fa fa-comments"></i>
                        <p class="text-gray-500">还没有消息，开始聊天吧！</p>
                    </div>
                `;
            return;
        }

        let html = '';
        messages.forEach(message => {
            const isOwn = message.sender_username === userData.username;
            html += `
                    <div class="message ${isOwn ? 'own' : ''}">
                        <div class="message-content">${message.message}</div>
                        <div class="message-time">${formatTime(message.created_at)}</div>
                    </div>
                `;
        });

        chatMessages.innerHTML = html;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('加载消息失败:', error);
        chatMessages.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-exclamation-triangle"></i>
                    <p class="text-red-500">加载消息失败</p>
                </div>
            `;
    }
}

// 发送消息
async function sendMessage() {
    if (!currentConversationId) return;

    const input = document.querySelector('.chat-input');
    const message = input.value.trim();

    if (!message) return;

    try {
        const chatMessages = document.querySelector('.chat-messages');

        // 添加自己的消息到UI
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message own';
        messageDiv.innerHTML = `
                <div class="message-content">${message}</div>
                <div class="message-time">刚刚</div>
            `;

        chatMessages.appendChild(messageDiv);
        input.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        input.value = '';

    } catch (error) {
        console.error('发送消息失败:', error);
        alert('发送消息失败，请稍后重试！');
    }
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;

    // 如果是今天
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }

    // 如果是昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return '昨天 ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }

    // 如果是一周内
    if (diffMs < 7 * 24 * 60 * 60 * 1000) {
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return days[date.getDay()] + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    }

    // 其他情况显示日期
    return date.toLocaleDateString();
}

//  植物评论抽屉相关
let plantCommentDrawerOpen = false;


// 打开植物评论抽屉
async function openPlantCommentDrawer(plantId) {
    currentCommentPlantId = plantId;
    plantCommentDrawerOpen = true;

    // 显示评论抽屉
    const overlay = document.getElementById('plant-comment-overlay');
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

    // 添加提交按钮事件
    const submitBtn = drawer.querySelector('.submit-plant-comment');
    if (submitBtn) {
        submitBtn.onclick = () => submitPlantComment(plantId);
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

// 关闭植物评论抽屉
function closePlantCommentDrawer(plantId) {
    plantCommentDrawerOpen = false;
    currentCommentPlantId = null;

    const overlay = document.getElementById('plant-comment-overlay');
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
            .order('created_at', {ascending: true});

        if (error) throw error;

        // 存储评论数据
        plantComments[plantId] = comments || [];

        // 更新评论数量显示
        updateCommentCountDisplay(plantId, comments?.length || 0);

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
            username: currentUser,
            content: content,
            created_at: new Date().toISOString()
        };
        // 提交评论到Supabase
        const {data: newComment, error} = await supabase
            .from('plant_comments')
            .insert([{
                plant_id: plantId,
                user_id: userData.id,
                username: currentUser,
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

        // 更新评论计数
        updatePlantInteractionCounts();

        const plant = worksData.find(p => p.id == plantId);
        if (plant && plant.created_by !== currentUser) {
            await createCommentNotification(plantId, plant.name, currentUser, userData.full_name || currentUser);
        }

        showSuccessMessage('评论发表成功！');

    } catch (error) {
        console.error('提交评论失败:', error);
        alert('评论发表失败，请稍后重试');
    } finally {
        // 恢复提交按钮
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

// 创建评论通知
async function createCommentNotification(plantId, plantName, commenterUsername, commenterName) {
    try {
        // 获取植物创建者
        const plant = worksData.find(p => p.id == plantId);
        if (!plant) return;

        const {data: plantOwner, error: ownerError} = await supabase
            .from('users')
            .select('username, full_name')
            .eq('username', plant.created_by)
            .single();

        if (ownerError) {
            console.error('获取植物所有者失败:', ownerError);
            return;
        }

        if (plantOwner.username === commenterUsername) return;

        // 创建通知
        const {error} = await supabase
            .from('notifications')
            .insert([{
                type: 'comment',
                sender_username: commenterUsername,
                sender_name: commenterName,
                recipient_username: plantOwner.username,
                plant_id: plantId,
                plant_name: plantName,
                message: `${commenterName} 评论了您的植物 "${plantName}"`,
                is_read: false,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            console.error('创建评论通知失败:', error);
        }

    } catch (error) {
        console.error('创建评论通知异常:', error);
    }
}

// 更新评论计数显示
function updateCommentCountDisplay(plantId, count) {
    // 更新评论按钮的计数显示
    document.querySelectorAll(`.plant-action-btn.comment[data-plant-id="${plantId}"] .comment-count`).forEach(span => {
        span.textContent = count;
    });
}

// 格式化时间显示
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

// 初始化评论抽屉
function initCommentDrawer() {
    // 确保评论抽屉HTML存在
    if (!document.getElementById('plant-comment-overlay')) {
        const commentDrawerHTML = `
                <div id="plant-comment-overlay" class="plant-comment-overlay">
                    <div class="plant-comment-drawer">
                        <div class="plant-comment-header">
                            <h3>植物评论</h3>
                            <button class="close-plant-comment">
                                <i class="fa fa-times"></i>
                            </button>
                        </div>
                        <div class="plant-comment-content">
                            <!-- 评论内容将在这里显示 -->
                        </div>
                        <div class="plant-comment-input-area">
                            <textarea class="plant-comment-input" placeholder="写下你的评论..." rows="3"></textarea>
                            <button class="submit-plant-comment">
                                <i class="fa fa-paper-plane mr-2"></i> 发表评论
                            </button>
                        </div>
                    </div>
                </div>
            `;

        document.body.insertAdjacentHTML('beforeend', commentDrawerHTML);
    }

    // 添加全局点击关闭事件
    document.getElementById('plant-comment-overlay').addEventListener('click', function (e) {
        if (e.target === this) {
            closePlantCommentDrawer(currentCommentPlantId);
        }
    });

    // 添加ESC键关闭事件
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && plantCommentDrawerOpen) {
            closePlantCommentDrawer(currentCommentPlantId);
        }
    });
}

// 在页面加载完成后初始化评论抽屉
document.addEventListener('DOMContentLoaded', function () {
    initCommentDrawer();
});
