// 视频标注工具主应用
class VideoAnnotationApp {
    constructor() {
        this.currentAnnotator = null;
        this.currentDataset = null;
        this.currentDatasetName = null;
        this.currentSample = null;
        this.currentSegment = null;
        this.currentSegmentList = []; // 存储当前片段列表用于导航
        this.videoPlayer = null;
        this.currentVideoElement = null;
        this.videoElements = []; // 存储所有视频元素引用
        this.startTimeSlider = null;
        this.endTimeSlider = null;
        
        // 多视频同步控制
        this.isSyncing = false; // 防止同步事件循环
        this.syncThreshold = 0.1; // 同步阈值（秒）
        this.lastSyncTime = 0; // 上次同步时间
        
        // 分页相关属性
        this.samplesPageSize = 10;  // 每页显示的样本数量
        this.samplesCurrentPage = 1;  // 当前样本页
        this.segmentsPageSize = 10;   // 每页显示的片段数量
        this.segmentsCurrentPage = 1; // 当前片段页
        this.pendingSegmentSelection = null; // 待选择的片段（用于跨样本导航）
        
        // 内存管理相关属性
        this.memoryMonitorInterval = null;
        this.maxBufferSize = 30; // 最大缓冲秒数
        
        // 注释保存防抖定时器
        this.commentSaveTimer = null;
        
        // 统计相关
        this.statisticsData = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.showAnnotatorModal();
        this.initializeVideoPlayer();
        
        // 初始化片段列表为空
        this.renderSegments([]);
        
        // 延迟测试视频播放器
        setTimeout(() => {
            this.testVideoPlayer();
        }, 1000);
        
        // 初始化按钮状态
        this.updateSegmentActionButtons();
        this.updateVideoActionButtons();
    }
    
    bindEvents() {
        // 标注者选择
        document.querySelectorAll('.annotator-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const annotator = e.target.closest('.annotator-btn').dataset.annotator;
                this.selectAnnotator(annotator);
            });
        });
        
        // 删除弃用片段按钮
        document.getElementById('removeRejectedBtn').addEventListener('click', () => {
            this.removeRejectedSegments();
        });
        
        // 播放片段按钮
        document.getElementById('playSegmentBtn').addEventListener('click', () => {
            this.playSegment();
        });
        
        // 暂停按钮
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.pauseVideo();
        });
        
        // 时间输入框事件
        this.bindTimeInputEvents();
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }
    
    // 绑定时间输入框事件
    bindTimeInputEvents() {
        const startTimeInput = document.getElementById('startTimeInput');
        const endTimeInput = document.getElementById('endTimeInput');
        
        if (startTimeInput) {
            // 改为失焦时验证，避免输入过程中中断
            startTimeInput.addEventListener('blur', (e) => {
                this.handleTimeInputChange('start', e.target.value);
            });
            // 保留输入事件用于实时更新，但不做验证
            startTimeInput.addEventListener('input', (e) => {
                this.handleTimeInputChangeWithoutValidation('start', e.target.value);
            });
        }
        
        if (endTimeInput) {
            // 改为失焦时验证，避免输入过程中中断
            endTimeInput.addEventListener('blur', (e) => {
                this.handleTimeInputChange('end', e.target.value);
            });
            // 保留输入事件用于实时更新，但不做验证
            endTimeInput.addEventListener('input', (e) => {
                this.handleTimeInputChangeWithoutValidation('end', e.target.value);
            });
        }
    }
    
    // 处理时间输入框变化（带验证，用于失焦时）
    handleTimeInputChange(type, value) {
        const time = this.parseTimeString(value);
        if (isNaN(time) || time < 0) return;
        
        if (type === 'start') {
            // 验证开始时间不能超过结束时间
            const endTime = this.parseTimeString(this.endTimeInput.value) || 10;
            if (time >= endTime) {
                alert('开始时间不能超过或等于结束时间');
                this.startTimeInput.value = this.formatTime(0);
                return;
            }
            
            // 使用统一的同步方法
            this.syncTimelineElements(time, endTime);
            
        } else if (type === 'end') {
            // 验证结束时间不能小于开始时间
            const startTime = this.parseTimeString(this.startTimeInput.value) || 0;
            if (time <= startTime) {
                alert('结束时间不能小于或等于开始时间');
                this.endTimeInput.value = this.formatTime(10);
                return;
            }
            
            // 使用统一的同步方法
            this.syncTimelineElements(startTime, time);
        }
        
        console.log(`🕐 时间输入框已更新并验证: ${type} = ${this.formatTime(time)}`);
    }
    
    // 处理时间输入框变化（无验证，用于输入过程中实时更新）
    handleTimeInputChangeWithoutValidation(type, value) {
        const time = this.parseTimeString(value);
        if (isNaN(time) || time < 0) return;
        
        if (type === 'start') {
            const endTime = this.parseTimeString(this.endTimeInput.value) || 10;
            // 不验证，不更新输入框，只同步时间轴
            this.syncTimelineElements(time, endTime, false);
        } else if (type === 'end') {
            const startTime = this.parseTimeString(this.startTimeInput.value) || 0;
            // 不验证，不更新输入框，只同步时间轴
            this.syncTimelineElements(startTime, time, false);
        }
        
        console.log(`🕐 时间输入框实时更新: ${type} = ${this.formatTime(time)}`);
    }
    
    showAnnotatorModal() {
        document.getElementById('annotatorModal').style.display = 'block';
    }
    
    hideAnnotatorModal() {
        document.getElementById('annotatorModal').style.display = 'none';
    }
    
    async selectAnnotator(annotator) {
        try {
            this.showLoading();
            
            const response = await fetch('/api/annotator/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ annotator })
            });
            
            if (response.ok) {
                this.currentAnnotator = annotator;
                this.updateCurrentAnnotatorDisplay();
                this.hideAnnotatorModal();
                this.loadDatasets();
            } else {
                throw new Error('Failed to select annotator');
            }
        } catch (error) {
            console.error('Error selecting annotator:', error);
            alert('选择标注者失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    updateCurrentAnnotatorDisplay() {
        const displayName = this.getAnnotatorDisplayName(this.currentAnnotator);
        document.getElementById('currentAnnotator').textContent = displayName;
    }
    
    getAnnotatorDisplayName(annotator) {
        if (annotator === 'unassigned') {
            return '未分配';
        }
        
        // 标注者ID到显示名称的映射
        const annotatorNames = {
            'annotator_1': 'Hu Shutong',
            'annotator_2': 'Wang Yu', 
            'annotator_3': 'Xiao Lijun',
            'annotator_4': 'Zhao Yanguang'
        };
        
        return annotatorNames[annotator] || `标注者 ${annotator.split('_')[1]}`;
    }
    
    // 处理键盘快捷键
    handleKeyboardShortcuts(e) {
        // 如果用户正在输入，不处理快捷键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch (e.key) {
            case 'ArrowLeft':
                // 左箭头：上一个片段
                e.preventDefault();
                this.selectPreviousSegment();
                break;
            case 'ArrowRight':
                // 右箭头：下一个片段
                e.preventDefault();
                this.selectNextSegment();
                break;
            case ' ':
                // 空格：播放/暂停当前位置（不跳转）
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'Enter':
                // 回车：从开始时间播放片段
                e.preventDefault();
                this.playSegment();
                break;
        }
    }
    
    async loadDatasets() {
        try {
            this.showLoading();
            
            const response = await fetch(`/api/datasets?annotator=${this.currentAnnotator}`);
            const datasets = await response.json();
            
            this.renderDatasets(datasets);
        } catch (error) {
            console.error('Error loading datasets:', error);
            alert('加载数据集失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    renderDatasets(datasets) {
        const container = document.getElementById('datasetList');
        container.innerHTML = '';
        
        if (datasets.length === 0) {
            container.innerHTML = '<p class="no-data">暂无数据集</p>';
            return;
        }
        
        datasets.forEach(dataset => {
            const datasetElement = this.createDatasetElement(dataset);
            container.appendChild(datasetElement);
        });
    }
    
    createDatasetElement(dataset) {
        const div = document.createElement('div');
        div.className = 'dataset-item';
        div.dataset.datasetId = dataset.id;
        
        div.innerHTML = `
            <div class="dataset-name">${dataset.name}</div>
            <div class="dataset-description">${dataset.description}</div>
            <div class="dataset-stats">
                <span>总样本: ${dataset.sample_count}</span>
                <span>已分配: ${dataset.assigned_sample_count}</span>
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.selectDataset(dataset.id);
        });
        
        return div;
    }
    
    async selectDataset(datasetId) {
        // 清空当前选择
        this.currentSample = null;
        this.currentSegment = null;
        
        // 重置分页状态
        this.samplesCurrentPage = 1;
        this.segmentsCurrentPage = 1;
        
        // 清空片段列表 - 数据集级别的片段不应该显示
        this.renderSegments([]);
        
        // 隐藏视频播放区域和时间轴
        this.hideVideoPlayer();
        
        // 更新选中状态
        document.querySelectorAll('.dataset-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-dataset-id="${datasetId}"]`).classList.add('active');
        
        this.currentDataset = { id: datasetId };
        this.currentDatasetName = datasetId;
        this.loadSamples(datasetId);
        
        // 更新按钮状态：选择数据集时隐藏所有操作按钮
        this.updateSegmentActionButtons();
        this.updateVideoActionButtons();
    }
    
    async loadSamples(datasetId) {
        try {
            this.showLoading();
            
            const response = await fetch(`/api/dataset/${datasetId}/samples?annotator=${this.currentAnnotator}`);
            const samples = await response.json();
            
            // 保存样本数据供后续使用
            this.datasetSamples = samples;
            
            this.renderSamples(samples);
        } catch (error) {
            console.error('Error loading samples:', error);
            alert('加载样本失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    renderSamples(samples) {
        const container = document.getElementById('sampleList');
        container.innerHTML = '';
        
        if (samples.length === 0) {
            container.innerHTML = '<p class="no-data">暂无样本</p>';
            return;
        }
        
        // 计算分页
        const totalPages = Math.ceil(samples.length / this.samplesPageSize);
        const startIndex = (this.samplesCurrentPage - 1) * this.samplesPageSize;
        const endIndex = Math.min(startIndex + this.samplesPageSize, samples.length);
        const currentPageSamples = samples.slice(startIndex, endIndex);
        
        // 渲染当前页的样本
        currentPageSamples.forEach(sample => {
            const sampleElement = this.createSampleElement(sample);
            container.appendChild(sampleElement);
        });
        
        // 渲染分页控件
        this.renderSamplesPagination(samples.length, totalPages);
    }
    
    createSampleElement(sample) {
        const div = document.createElement('div');
        div.className = 'sample-item';
        div.dataset.sampleId = sample.id;
        
        const typeClass = this.getSampleTypeClass(sample.type);
        const statusClass = this.getReviewStatusClass(sample.review_status);
        
        // 处理样本名称显示
        const displayName = this.formatSampleName(sample.name);
        
        // 构建异常状态显示
        let exceptionHtml = '';
        if (sample.exception_status && sample.exception_status.is_exception) {
            exceptionHtml = `
                <div class="sample-exception-status">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span class="exception-reason">${sample.exception_status.reason || '视频下载失败'}</span>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div class="sample-name" title="${sample.name}">${displayName}</div>
            <div class="sample-meta">
                <span class="sample-type ${typeClass}">${this.getSampleTypeText(sample.type)}</span>
                <span class="review-status ${statusClass}">${sample.review_status}</span>
            </div>
            ${exceptionHtml}
            <div class="video-download-status" id="download-status-${sample.id}">
                <span class="status-text">检查中...</span>
                <button class="btn btn-sm btn-primary download-btn" onclick="app.downloadVideo('${sample.id}')" style="display: none;">
                    <i class="fas fa-download"></i> 下载
                </button>
                <button class="btn btn-sm btn-danger delete-btn" onclick="app.deleteVideo('${sample.id}')" style="display: none;">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.selectSample(sample);
        });
        
        // 检查视频下载状态
        this.checkVideoDownloadStatus(sample);
        
        return div;
    }
    
    formatSampleName(name) {
        // 如果名称长度超过25个字符，进行截断处理
        if (name.length <= 25) {
            return name;
        }
        
        // 尝试在合适的位置截断
        const maxLength = 25;
        const truncated = name.substring(0, maxLength - 3) + '...';
        return truncated;
    }
    
    renderSamplesPagination(totalSamples, totalPages) {
        const container = document.getElementById('sampleList');
        
        // 创建分页控件容器
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';
        
        // 显示分页信息
        const infoText = document.createElement('div');
        const startIndex = (this.samplesCurrentPage - 1) * this.samplesPageSize + 1;
        const endIndex = Math.min(this.samplesCurrentPage * this.samplesPageSize, totalSamples);
        infoText.textContent = `第 ${startIndex}-${endIndex} 条，共 ${totalSamples} 条`;
        paginationContainer.appendChild(infoText);
        
        // 分页按钮容器
        const buttonContainer = document.createElement('div');
        
        // 上一页按钮
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-sm btn-outline-primary';
        prevBtn.textContent = '上一页';
        prevBtn.disabled = this.samplesCurrentPage <= 1;
        prevBtn.onclick = () => this.changeSamplesPage(this.samplesCurrentPage - 1);
        buttonContainer.appendChild(prevBtn);
        
        // 页码按钮
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn btn-sm ${i === this.samplesCurrentPage ? 'btn-primary' : 'btn-outline-primary'}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => this.changeSamplesPage(i);
            buttonContainer.appendChild(pageBtn);
        }
        
        // 下一页按钮
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-sm btn-outline-primary';
        nextBtn.textContent = '下一页';
        nextBtn.disabled = this.samplesCurrentPage >= totalPages;
        nextBtn.onclick = () => this.changeSamplesPage(this.samplesCurrentPage + 1);
        buttonContainer.appendChild(nextBtn);
        
        paginationContainer.appendChild(buttonContainer);
        container.appendChild(paginationContainer);
    }
    
    changeSamplesPage(page) {
        if (page < 1 || page > Math.ceil(this.datasetSamples.length / this.samplesPageSize)) {
            return;
        }
        
        this.samplesCurrentPage = page;
        this.renderSamples(this.datasetSamples);
        
        // 滚动到列表顶部
        document.getElementById('sampleList').scrollTop = 0;
    }
    
    getSampleTypeClass(type) {
        switch (type) {
            case 'single_video': return 'single';
            case 'multiple_videos': return 'multiple';
            case 'youtube': return 'youtube';
            default: return 'single';
        }
    }
    
    getSampleTypeText(type) {
        switch (type) {
            case 'single_video': return '单视频';
            case 'multiple_videos': return '多视频';
            case 'youtube': return 'YouTube';
            default: return '单视频';
        }
    }
    
    getReviewStatusClass(status) {
        switch (status) {
            case '审阅中': return 'reviewing';
            case '未审阅': return 'pending';
            case '已审阅': return 'reviewed';
            default: return 'pending';
        }
    }
    
    // 检查视频下载状态
    async checkVideoDownloadStatus(sample) {
        try {
            // 获取数据集名称 - 修复获取逻辑
            let datasetName = 'test_dataset'; // 默认值
            
            if (this.currentDataset) {
                if (typeof this.currentDataset === 'string') {
                    datasetName = this.currentDataset;
                } else if (this.currentDataset.id) {
                    datasetName = this.currentDataset.id;
                }
            } else if (this.currentDatasetName) {
                datasetName = this.currentDatasetName;
            }
            
            console.log('🔍 检查视频状态 - 数据集名称:', datasetName);
            
            // 准备视频路径列表
            let videoPaths = [];
            if (sample.type === 'single_video') {
                videoPaths = [sample.video_path];
            } else if (sample.type === 'multiple_videos') {
                videoPaths = sample.video_paths || [];
            } else if (sample.type === 'youtube') {
                // 对于YouTube视频，使用本地下载的文件路径
                const localVideoPath = `/static/videos/${datasetName}/${sample.id}/${sample.id}_youtube.mp4`;
                videoPaths = [localVideoPath];
            }
            
            console.log('🎬 视频路径列表:', videoPaths);
            
            if (videoPaths.length === 0) {
                this.updateDownloadStatus(sample.id, '无视频文件', false);
                return;
            }
            
            // 调用API检查视频状态
            const params = new URLSearchParams({
                dataset: datasetName,
                sample: sample.id,
                'video_paths[]': videoPaths
            });
            
            console.log('🌐 API调用参数:', params.toString());
            
            const response = await fetch(`/api/video/status?${params}`);
            if (response.ok) {
                const result = await response.json();
                console.log('✅ API响应:', result);
                this.updateDownloadStatusFromAPI(sample.id, result.video_statuses, sample);
                
                // 检查并更新异常状态
                this.checkAndUpdateExceptionStatus(sample.id);
            } else {
                console.log('❌ API调用失败:', response.status, response.statusText);
                this.updateDownloadStatus(sample.id, '检查失败', false);
            }
            
        } catch (error) {
            console.error('检查视频下载状态失败:', error);
            this.updateDownloadStatus(sample.id, '检查失败', false);
        }
    }
    
    // 检查并更新异常状态
    async checkAndUpdateExceptionStatus(sampleId) {
        try {
            const response = await fetch(`/api/sample/${sampleId}/exception_status`);
            if (response.ok) {
                const result = await response.json();
                const exceptionStatus = result.exception_status;
                
                // 更新当前样本的异常状态
                if (this.currentSample && this.currentSample.id === sampleId) {
                    this.currentSample.exception_status = exceptionStatus;
                    // 更新UI显示
                    this.updateVideoActionButtons();
                }
                
                // 更新样本列表中的异常状态显示
                this.updateSampleExceptionStatusDisplay(sampleId, exceptionStatus);
            }
        } catch (error) {
            console.error('检查异常状态失败:', error);
        }
    }
    
    // 更新样本列表中的异常状态显示
    updateSampleExceptionStatusDisplay(sampleId, exceptionStatus) {
        const sampleElement = document.querySelector(`[data-sample-id="${sampleId}"]`);
        if (!sampleElement) return;
        
        let exceptionElement = sampleElement.querySelector('.sample-exception-status');
        
        if (exceptionStatus && exceptionStatus.is_exception) {
            // 显示异常状态
            if (!exceptionElement) {
                exceptionElement = document.createElement('div');
                exceptionElement.className = 'sample-exception-status';
                exceptionElement.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <span class="exception-reason">${exceptionStatus.reason || '视频下载失败'}</span>
                `;
                
                // 插入到sample-meta之后
                const sampleMeta = sampleElement.querySelector('.sample-meta');
                if (sampleMeta) {
                    sampleMeta.insertAdjacentElement('afterend', exceptionElement);
                }
            } else {
                // 更新现有的异常状态
                const reasonElement = exceptionElement.querySelector('.exception-reason');
                if (reasonElement) {
                    reasonElement.textContent = exceptionStatus.reason || '视频下载失败';
                }
            }
        } else {
            // 清除异常状态
            if (exceptionElement) {
                exceptionElement.remove();
            }
        }
    }
    
    // 更新下载状态显示
    updateDownloadStatus(sampleId, statusText, showDownloadBtn = false, showDeleteBtn = false) {
        const statusElement = document.getElementById(`download-status-${sampleId}`);
        if (!statusElement) return;
        
        const statusTextElement = statusElement.querySelector('.status-text');
        const downloadBtn = statusElement.querySelector('.download-btn');
        const deleteBtn = statusElement.querySelector('.delete-btn');
        
        if (statusTextElement) {
            statusTextElement.textContent = statusText;
        }
        
        if (downloadBtn) {
            downloadBtn.style.display = showDownloadBtn ? 'inline-block' : 'none';
        }
        
        if (deleteBtn) {
            deleteBtn.style.display = showDeleteBtn ? 'inline-block' : 'none';
        }
    }
    
    // 根据API结果更新下载状态
    updateDownloadStatusFromAPI(sampleId, videoStatuses, sample) {
        if (!videoStatuses || videoStatuses.length === 0) {
            this.updateDownloadStatus(sampleId, '无视频文件', false);
            return;
        }
        
        // 检查是否所有视频都已下载
        const allDownloaded = videoStatuses.every(status => status.exists);
        const anyDownloaded = videoStatuses.some(status => status.exists);
        
        if (allDownloaded) {
            // 所有视频都已下载
            const totalSize = videoStatuses.reduce((sum, status) => {
                return sum + this.parseFileSize(status.size);
            }, 0);
            
            this.updateDownloadStatus(sampleId, `已下载 (${this.formatFileSize(totalSize)})`, false, true);
        } else if (anyDownloaded) {
            // 部分视频已下载
            const downloadedCount = videoStatuses.filter(status => status.exists).length;
            const totalCount = videoStatuses.length;
            this.updateDownloadStatus(sampleId, `部分下载 (${downloadedCount}/${totalCount})`, true, false);
        } else {
            // 没有视频下载
            this.updateDownloadStatus(sampleId, '未下载', true, false);
        }
    }
    
    // 下载视频
    async downloadVideo(sampleId) {
        try {
            const sample = this.findSampleById(sampleId);
            if (!sample) {
                alert('找不到指定的样本');
                return;
            }
            
            // 获取数据集名称
            let datasetName = 'test_dataset';
            if (this.currentDataset) {
                if (typeof this.currentDataset === 'string') {
                    datasetName = this.currentDataset;
                } else if (this.currentDataset.id) {
                    datasetName = this.currentDataset.id;
                }
            } else if (this.currentDatasetName) {
                datasetName = this.currentDatasetName;
            }
            
            // 显示下载确认对话框
            let confirmMessage = `确定要下载样本 "${sample.name}" 的视频吗？\n\n`;
            if (sample.type === 'youtube') {
                confirmMessage += `类型: YouTube视频\n`;
                confirmMessage += `注意: 下载可能需要较长时间`;
            } else {
                confirmMessage += `类型: ${this.getSampleTypeText(sample.type)}\n`;
                confirmMessage += `来源: HuggingFace仓库`;
            }
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // 更新状态为下载中
            this.updateDownloadStatus(sampleId, '下载中...', false, false);
            
            // 准备下载请求数据
            const downloadData = {
                dataset: datasetName,
                sample: sample.id,
                type: sample.type,
                video_info: sample.type === 'youtube' ? { youtube_url: sample.youtube_url } : {}
            };
            

            
            // 调用下载API
            const response = await fetch('/api/video/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(downloadData)
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    alert(`下载成功！\n\n${result.message}`);
                    
                    // 重新检查下载状态
                    setTimeout(() => {
                        this.checkVideoDownloadStatus(sample);
                        
                        // 如果当前正在播放这个样本，自动更新播放器
                        if (this.currentSample && this.currentSample.id === sampleId) {
                            console.log('🔄 检测到当前样本下载完成，自动更新播放器...');
                            
                            // 强制重新加载视频播放器
                            setTimeout(() => {
                                this.updateVideoPlayer(this.currentSample);
                                console.log('🎬 播放器已强制更新');
                            }, 500);
                        }
                    }, 1000);
                    
                } else {
                    alert(`下载失败：${result.message}`);
                    this.updateDownloadStatus(sampleId, '下载失败', true, false);
                }
            } else {
                const errorResult = await response.json();
                alert(`下载失败：${errorResult.error || '未知错误'}`);
                this.updateDownloadStatus(sampleId, '下载失败', true, false);
            }
            
        } catch (error) {
            console.error('下载视频失败:', error);
            alert('下载失败，请重试');
            this.updateDownloadStatus(sampleId, '下载失败', true, false);
        }
    }
    
    // 删除视频
    async deleteVideo(sampleId) {
        try {
            const sample = this.findSampleById(sampleId);
            if (!sample) {
                alert('找不到指定的样本');
                return;
            }
            
            // 获取数据集名称
            let datasetName = 'test_dataset';
            if (this.currentDataset) {
                if (typeof this.currentDataset === 'string') {
                    datasetName = this.currentDataset;
                } else if (this.currentDataset.id) {
                    datasetName = this.currentDataset.id;
                }
            } else if (this.currentDatasetName) {
                datasetName = this.currentDatasetName;
            }
            
            // 显示删除确认对话框
            const confirmMessage = `确定要删除样本 "${sample.name}" 的本地视频文件吗？\n\n` +
                `⚠️ 注意：\n` +
                `• 只删除本地视频文件，不影响JSON数据\n` +
                `• 删除后如需观看需要重新下载\n` +
                `• 此操作不可撤销`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            // 更新状态为删除中
            this.updateDownloadStatus(sampleId, '删除中...', false, false);
            
            // 准备删除请求数据
            const deleteData = {
                dataset: datasetName,
                sample: sample.id,
                type: sample.type
            };
            
            // 调用删除API
            const response = await fetch('/api/video/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(deleteData)
            });
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success) {
                    alert(`删除成功！\n\n${result.message}`);
                    
                    // 重新检查下载状态
                    setTimeout(() => {
                        this.checkVideoDownloadStatus(sample);
                        
                        // 如果当前正在播放这个样本，自动更新播放器
                        if (this.currentSample && this.currentSample.id === sampleId) {
                            console.log('🔄 检测到当前样本删除完成，自动更新播放器...');
                            
                            // 强制重新加载视频播放器
                            setTimeout(() => {
                                this.updateVideoPlayer(this.currentSample);
                                console.log('🎬 播放器已强制更新');
                            }, 500);
                        }
                    }, 1000);
                    
                } else {
                    alert(`删除失败：${result.message}`);
                    this.updateDownloadStatus(sampleId, '删除失败', false, true);
                }
            } else {
                const errorResult = await response.json();
                alert(`删除失败：${errorResult.error || '未知错误'}`);
                this.updateDownloadStatus(sampleId, '删除失败', false, true);
            }
            
        } catch (error) {
            console.error('删除视频失败:', error);
            alert(`删除失败：${error.message}`);
            this.updateDownloadStatus(sampleId, '删除失败', false, true);
        }
    }
    
    // 查找样本ById
    findSampleById(sampleId) {
        // 从当前数据集的所有样本中查找
        if (this.currentDataset && this.datasetSamples) {
            return this.datasetSamples.find(sample => sample.id === sampleId);
        }
        
        // 如果当前样本匹配，返回当前样本
        if (this.currentSample && this.currentSample.id === sampleId) {
            return this.currentSample;
        }
        
        return null;
    }
    
    // 解析文件大小字符串
    parseFileSize(sizeStr) {
        const units = { 'B': 1, 'KB': 1024, 'MB': 1024*1024, 'GB': 1024*1024*1024, 'TB': 1024*1024*1024*1024 };
        const match = sizeStr.match(/^([\d.]+)([KMGT]?B)$/);
        if (match) {
            const value = parseFloat(match[1]);
            const unit = match[2] || 'B';
            return value * (units[unit] || 1);
        }
        return 0;
    }
    
    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024.0;
            i += 1;
        }
        
        return `${bytes.toFixed(1)}${units[i]}`;
    }
    
    selectSample(sample) {
        // console.log('🎯 选择样本: ' + sample.name);
        // console.log('📊 样本类型: ' + sample.type);
        // console.log('📁 样本路径: ' + (sample.video_path || sample.video_paths));
        
        // 暂停当前播放的视频
        this.pauseCurrentVideo();
        
        // 重置进度条状态
        this.resetTimelineProgress();
        
        // 更新选中状态
        document.querySelectorAll('.sample-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-sample-id="${sample.id}"]`).classList.add('active');
        
        this.currentSample = sample;
        this.currentSegment = null; // 清除当前片段选择
        
        // 重置片段分页状态
        this.segmentsCurrentPage = 1;
        
        this.loadSampleSegments(sample.id);
        
        // 延迟更新视频播放器，确保DOM已更新
        // console.log('⏰ 延迟100ms后更新视频播放器...');
        setTimeout(() => {
            console.log('🚀 开始更新视频播放器');
            this.updateVideoPlayer(sample);
            
            // 延迟初始化时间轴，确保视频元素已准备好
                    // console.log('⏰ 延迟200ms后初始化时间轴...');
        setTimeout(() => {
            this.initializeDefaultTimeline();
            // console.log('🔄 样本已选择，时间轴已重置为默认状态');
        }, 200);
            
            // 隐藏片段控制按钮
            this.hideSegmentControls();
            
            // 更新视频操作按钮状态
            this.updateVideoActionButtons();
        }, 100);
    }
    
    async loadSegments(datasetId) {
        try {
            const response = await fetch(`/api/dataset/${datasetId}/segments`);
            const segments = await response.json();
            
            this.renderSegments(segments);
        } catch (error) {
            console.error('Error loading segments:', error);
        }
    }
    
    async loadSampleSegments(sampleId) {
        try {
            // 如果没有选中视频样本，清空片段列表
            if (!sampleId || !this.currentSample) {
                this.renderSegments([]);
                return;
            }
            
            const response = await fetch(`/api/sample/${sampleId}/segments`);
            const segments = await response.json();
            
            this.renderSegments(segments);
        } catch (error) {
            console.error('Error loading sample segments:', error);
            // 出错时也清空片段列表
            this.renderSegments([]);
        }
    }
    
    renderSegments(segments) {
        const container = document.getElementById('segmentList');
        container.innerHTML = '';
        
        // 存储当前片段列表用于导航
        this.currentSegmentList = segments;
        
        if (segments.length === 0) {
            container.innerHTML = '<p class="no-data">暂无片段</p>';
            document.getElementById('removeRejectedBtn').style.display = 'none';
            // 禁用导航按钮
            this.updateNavigationButtons();
            return;
        }
        
        // 检查是否有弃用的片段
        const hasRejected = segments.some(s => s.status === '弃用');
        document.getElementById('removeRejectedBtn').style.display = hasRejected ? 'block' : 'none';
        
        // 计算分页
        const totalPages = Math.ceil(segments.length / this.segmentsPageSize);
        const startIndex = (this.segmentsCurrentPage - 1) * this.segmentsPageSize;
        const endIndex = Math.min(startIndex + this.segmentsPageSize, segments.length);
        const currentPageSegments = segments.slice(startIndex, endIndex);
        
        // 渲染当前页的片段
        currentPageSegments.forEach(segment => {
            const segmentElement = this.createSegmentElement(segment);
            container.appendChild(segmentElement);
        });
        
        // 渲染分页控件
        this.renderSegmentsPagination(segments.length, totalPages);
        
        // 更新导航按钮状态
        this.updateNavigationButtons();
        
        // 如果有选中的片段，确保它被高亮显示
        if (this.currentSegment) {
            this.highlightSelectedSegment();
        }
        
        // 检查是否有待选择的片段（来自跨样本导航）
        if (this.pendingSegmentSelection) {
            console.log(`🔄 渲染完成后，开始选择待选片段: ${this.pendingSegmentSelection.segment.id}`);
            this.selectSegment(this.pendingSegmentSelection.segment);
            console.log(`✅ 已选择样本 ${this.pendingSegmentSelection.sampleId} 的${this.pendingSegmentSelection.position}片段`);
            
            // 清除待选择标记
            this.pendingSegmentSelection = null;
        }
    }
    
    createSegmentElement(segment) {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.dataset.segmentId = segment.id;
        
        const statusClass = this.getSegmentStatusClass(segment.status);
        
        div.innerHTML = `
            <div class="segment-header">
                <div class="segment-time">
                    ${this.formatTime(segment.start_time)} - ${this.formatTime(segment.end_time)}
                </div>
                <div class="segment-status">
                    <span class="segment-status-badge ${statusClass}">${this.getSegmentStatusText(segment.status)}</span>
                </div>
            </div>
        `;
        
        // 点击片段项时选中片段
        div.addEventListener('click', () => {
            this.selectSegment(segment);
        });
        
        return div;
    }
    
    // 实时保存片段注释（带防抖）
    async saveSegmentComment(segmentId, comment) {
        // 清除之前的定时器
        if (this.commentSaveTimer) {
            clearTimeout(this.commentSaveTimer);
        }
        
        // 设置新的定时器，延迟500ms后保存
        this.commentSaveTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/segment/${segmentId}/comment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ comment: comment })
                });
                
                if (response.ok) {
                    // 更新当前片段列表中的注释
                    if (this.currentSegmentList) {
                        const segment = this.currentSegmentList.find(s => s.id === segmentId);
                        if (segment) {
                            segment.comment = comment;
                        }
                    }
                    
                    // 如果当前选中的片段就是这个片段，也更新它
                    if (this.currentSegment && this.currentSegment.id === segmentId) {
                        this.currentSegment.comment = comment;
                    }
                    
                    console.log(`✅ 片段 ${segmentId} 注释已保存`);
                } else {
                    console.error(`❌ 保存注释失败: ${response.status}`);
                }
            } catch (error) {
                console.error('保存注释时出错:', error);
            }
        }, 500); // 500ms防抖延迟
    }
    
    renderSegmentsPagination(totalSegments, totalPages) {
        const container = document.getElementById('segmentList');
        
        // 创建分页控件容器
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';
        
        // 显示分页信息
        const infoText = document.createElement('div');
        const startIndex = (this.segmentsCurrentPage - 1) * this.segmentsPageSize + 1;
        const endIndex = Math.min(this.segmentsCurrentPage * this.segmentsPageSize, totalSegments);
        infoText.textContent = `第 ${startIndex}-${endIndex} 条，共 ${totalSegments} 条`;
        paginationContainer.appendChild(infoText);
        
        // 分页按钮容器
        const buttonContainer = document.createElement('div');
        
        // 上一页按钮
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-sm btn-outline-primary';
        prevBtn.textContent = '上一页';
        prevBtn.disabled = this.segmentsCurrentPage <= 1;
        prevBtn.onclick = () => this.changeSegmentsPage(this.segmentsCurrentPage - 1);
        buttonContainer.appendChild(prevBtn);
        
        // 页码按钮
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn btn-sm ${i === this.segmentsCurrentPage ? 'btn-primary' : 'btn-outline-primary'}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => this.changeSegmentsPage(i);
            buttonContainer.appendChild(pageBtn);
        }
        
        // 下一页按钮
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-sm btn-outline-primary';
        nextBtn.textContent = '下一页';
        nextBtn.disabled = this.segmentsCurrentPage >= totalPages;
        nextBtn.onclick = () => this.changeSegmentsPage(this.segmentsCurrentPage + 1);
        buttonContainer.appendChild(nextBtn);
        
        paginationContainer.appendChild(buttonContainer);
        container.appendChild(paginationContainer);
    }
    
    changeSegmentsPage(page) {
        if (page < 1 || page > Math.ceil(this.currentSegmentList.length / this.segmentsPageSize)) {
            return;
        }
        
        this.segmentsCurrentPage = page;
        this.renderSegments(this.currentSegmentList);
        
        // 滚动到列表顶部
        document.getElementById('segmentList').scrollTop = 0;
    }
    
    getSegmentStatusClass(status) {
        switch (status) {
            case '待抉择': return 'pending';
            case '选用': return 'selected';
            case '弃用': return 'rejected';
            default: return 'pending';
        }
    }
    
    getSegmentStatusText(status) {
        return status;
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // 暂停当前播放的视频
    pauseCurrentVideo() {
        if (this.currentVideoElement && !this.currentVideoElement.paused) {
            this.currentVideoElement.pause();
            console.log('⏸️ 已暂停当前播放的视频');
        }
    }
    
    // 更新导航按钮状态
    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevSegmentBtn');
        const nextBtn = document.getElementById('nextSegmentBtn');
        
        if (!this.currentSegmentList || this.currentSegmentList.length === 0) {
            // 没有片段时禁用所有导航按钮
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        if (!this.currentSegment) {
            // 没有选中片段时启用所有按钮
            if (prevBtn) prevBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            return;
        }
        
        // 找到当前片段在列表中的索引
        const currentIndex = this.currentSegmentList.findIndex(s => s.id === this.currentSegment.id);
        
        if (currentIndex === -1) {
            // 当前片段不在列表中，启用所有按钮
            if (prevBtn) prevBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            return;
        }
        
        // 根据位置更新按钮状态
        if (prevBtn) prevBtn.disabled = (currentIndex === 0);
        if (nextBtn) nextBtn.disabled = (currentIndex === this.currentSegmentList.length - 1);
    }
    
    // 更新片段操作按钮状态
    updateSegmentActionButtons() {
        const updateSegmentTimeBtn = document.getElementById('updateSegmentTimeBtn');
        const deleteSegmentBtn = document.getElementById('deleteSegmentBtn');
        
        if (this.currentSegment) {
            // 有选中片段时显示相关按钮
            if (updateSegmentTimeBtn) updateSegmentTimeBtn.style.display = 'inline-block';
            if (deleteSegmentBtn) deleteSegmentBtn.style.display = 'inline-block';
        } else {
            // 没有选中片段时隐藏相关按钮
            if (updateSegmentTimeBtn) updateSegmentTimeBtn.style.display = 'none';
            if (deleteSegmentBtn) deleteSegmentBtn.style.display = 'none';
        }
    }
    
    // 更新视频操作按钮状态
    updateVideoActionButtons() {
        const markVideoReviewedBtn = document.getElementById('markVideoReviewedBtn');
        const markVideoUnreviewedBtn = document.getElementById('markVideoUnreviewedBtn');
        const exceptionStatusDisplay = document.getElementById('exceptionStatusDisplay');
        const exceptionReason = document.getElementById('exceptionReason');
        
        if (this.currentSample) {
            // 处理审阅状态按钮
            if (this.currentSample.review_status === '已审阅') {
                // 已审阅时显示"设置为未审阅"按钮
                if (markVideoReviewedBtn) markVideoReviewedBtn.style.display = 'none';
                if (markVideoUnreviewedBtn) markVideoUnreviewedBtn.style.display = 'inline-block';
            } else {
                // 未审阅时显示"标记为已审阅"按钮
                if (markVideoReviewedBtn) markVideoReviewedBtn.style.display = 'inline-block';
                if (markVideoUnreviewedBtn) markVideoUnreviewedBtn.style.display = 'none';
            }
            
            // 处理异常状态显示
            if (this.currentSample.exception_status && this.currentSample.exception_status.is_exception) {
                // 显示异常状态
                if (exceptionStatusDisplay) {
                    exceptionStatusDisplay.style.display = 'flex';
                    if (exceptionReason) {
                        exceptionReason.textContent = this.currentSample.exception_status.reason || '视频下载失败';
                    }
                }
            } else {
                // 隐藏异常状态
                if (exceptionStatusDisplay) {
                    exceptionStatusDisplay.style.display = 'none';
                }
            }
        } else {
            // 没有选中视频时隐藏所有按钮和状态
            if (markVideoReviewedBtn) markVideoReviewedBtn.style.display = 'none';
            if (markVideoUnreviewedBtn) markVideoUnreviewedBtn.style.display = 'none';
            if (exceptionStatusDisplay) exceptionStatusDisplay.style.display = 'none';
        }
    }
    
    // 选择上一个片段
    selectPreviousSegment() {
        if (!this.currentSegmentList || this.currentSegmentList.length === 0) {
            alert('没有可用的片段');
            return;
        }
        
        if (!this.currentSegment) {
            // 如果没有选中片段，选择最后一个片段
            const lastSegment = this.currentSegmentList[this.currentSegmentList.length - 1];
            this.selectSegment(lastSegment);
            return;
        }
        
        // 找到当前片段在列表中的索引
        const currentIndex = this.currentSegmentList.findIndex(s => s.id === this.currentSegment.id);
        
        if (currentIndex === -1) {
            // 当前片段不在列表中，选择第一个片段
            this.selectSegment(this.currentSegmentList[0]);
            return;
        }
        
        if (currentIndex > 0) {
            // 选择上一个片段
            const prevSegment = this.currentSegmentList[currentIndex - 1];
            this.selectSegment(prevSegment);
        } else {
            // 已经是第一个片段，尝试切换到上一个样本
            this.selectPreviousSample();
        }
        
        // 检查是否需要切换到上一页
        this.ensureSegmentVisible();
    }
    
    // 选择下一个片段
    selectNextSegment() {
        console.log('🔄 selectNextSegment 被调用');
        console.log('当前片段:', this.currentSegment);
        console.log('片段列表长度:', this.currentSegmentList?.length);
        
        if (!this.currentSegmentList || this.currentSegmentList.length === 0) {
            alert('没有可用的片段');
            return;
        }
        
        if (!this.currentSegment) {
            // 如果没有选中片段，选择第一个片段
            console.log('没有选中片段，选择第一个片段');
            this.selectSegment(this.currentSegmentList[0]);
            return;
        }
        
        // 找到当前片段在列表中的索引
        const currentIndex = this.currentSegmentList.findIndex(s => s.id === this.currentSegment.id);
        console.log('当前片段索引:', currentIndex, '总长度:', this.currentSegmentList.length);
        
        if (currentIndex === -1) {
            // 当前片段不在列表中，选择第一个片段
            console.log('当前片段不在列表中，选择第一个片段');
            this.selectSegment(this.currentSegmentList[0]);
            return;
        }
        
        if (currentIndex < this.currentSegmentList.length - 1) {
            // 选择下一个片段
            const nextSegment = this.currentSegmentList[currentIndex + 1];
            console.log('选择下一个片段:', nextSegment.id);
            this.selectSegment(nextSegment);
        } else {
            // 已经是最后一个片段，尝试切换到下一个样本
            console.log('已经是最后一个片段，尝试切换到下一个样本');
            this.selectNextSample();
        }
        
        // 检查是否需要切换到下一页
        this.ensureSegmentVisible();
    }
    
    ensureSegmentVisible() {
        if (!this.currentSegment || !this.currentSegmentList) {
            return;
        }
        
        // 找到当前片段在完整列表中的索引
        const fullIndex = this.currentSegmentList.findIndex(s => s.id === this.currentSegment.id);
        if (fullIndex === -1) {
            return;
        }
        
        // 计算应该在哪一页
        const targetPage = Math.floor(fullIndex / this.segmentsPageSize) + 1;
        
        // 如果不在当前页，切换到目标页
        if (targetPage !== this.segmentsCurrentPage) {
            console.log(`🔄 片段不在当前页，切换到第${targetPage}页`);
            this.segmentsCurrentPage = targetPage;
            this.renderSegments(this.currentSegmentList);
            
            // 滚动到列表顶部
            document.getElementById('segmentList').scrollTop = 0;
            
            // 确保选中的片段在视图中被高亮显示
            this.highlightSelectedSegment();
        }
    }
    
    // 高亮显示选中的片段
    highlightSelectedSegment() {
        if (!this.currentSegment) return;
        
        // 移除所有现有的高亮
        const allSegments = document.querySelectorAll('.segment-item');
        allSegments.forEach(item => {
            item.classList.remove('active');
        });
        
        // 为当前选中的片段添加高亮
        const selectedElement = document.querySelector(`[data-segment-id="${this.currentSegment.id}"]`);
        if (selectedElement) {
            selectedElement.classList.add('active');
            console.log(`✅ 片段 ${this.currentSegment.id} 已高亮显示`);
        } else {
            console.warn(`⚠️ 未找到片段元素 ${this.currentSegment.id}`);
        }
    }
    
    // 选择下一个样本
    selectNextSample() {
        console.log('🔄 selectNextSample 被调用');
        console.log('当前样本:', this.currentSample);
        console.log('样本列表长度:', this.datasetSamples?.length);
        
        if (!this.datasetSamples || this.datasetSamples.length === 0) {
            console.log('没有可用的样本');
            alert('没有可用的样本');
            return;
        }
        
        if (!this.currentSample) {
            // 如果没有选中样本，选择第一个样本
            console.log('没有选中样本，选择第一个样本');
            this.selectSample(this.datasetSamples[0]);
            return;
        }
        
        // 找到当前样本在列表中的索引
        const currentIndex = this.datasetSamples.findIndex(s => s.id === this.currentSample.id);
        console.log('当前样本索引:', currentIndex, '总长度:', this.datasetSamples.length);
        
        if (currentIndex === -1) {
            // 当前样本不在列表中，选择第一个样本
            console.log('当前样本不在列表中，选择第一个样本');
            this.selectSample(this.datasetSamples[0]);
            return;
        }
        
        if (currentIndex < this.datasetSamples.length - 1) {
            // 选择下一个样本
            const nextSample = this.datasetSamples[currentIndex + 1];
            console.log(`🔄 切换到下一个样本: ${nextSample.id}`);
            this.selectSample(nextSample);
            
            // 选择新样本的第一个片段（如果有的话）
            this.selectFirstSegmentOfSample(nextSample);
        } else {
            // 已经是最后一个样本
            console.log('已经是最后一个样本了');
            alert('已经是最后一个样本了');
        }
    }
    
    // 选择上一个样本
    selectPreviousSample() {
        if (!this.datasetSamples || this.datasetSamples.length === 0) {
            alert('没有可用的样本');
            return;
        }
        
        if (!this.currentSample) {
            // 如果没有选中样本，选择最后一个样本
            const lastSample = this.datasetSamples[this.datasetSamples.length - 1];
            this.selectSample(lastSample);
            return;
        }
        
        // 找到当前样本在列表中的索引
        const currentIndex = this.datasetSamples.findIndex(s => s.id === this.currentSample.id);
        
        if (currentIndex === -1) {
            // 当前样本不在列表中，选择第一个样本
            this.selectSample(this.datasetSamples[0]);
            return;
        }
        
        if (currentIndex > 0) {
            // 选择上一个样本
            const prevSample = this.datasetSamples[currentIndex - 1];
            console.log(`🔄 切换到上一个样本: ${prevSample.id}`);
            this.selectSample(prevSample);
            
            // 选择新样本的最后一个片段（如果有的话）
            this.selectLastSegmentOfSample(prevSample);
        } else {
            // 已经是第一个样本
            alert('已经是第一个样本了');
        }
    }
    
    // 选择样本的第一个片段
    async selectFirstSegmentOfSample(sample) {
        try {
            // 获取样本的片段列表
            const response = await fetch(`/api/sample/${sample.id}/segments`);
            if (response.ok) {
                const segments = await response.json();
                if (segments && segments.length > 0) {
                    // 标记需要选择的片段，在渲染完成后自动选择
                    this.pendingSegmentSelection = {
                        segment: segments[0],
                        sampleId: sample.id,
                        position: '第一个'
                    };
                    console.log(`📝 标记待选择片段: ${segments[0].id} (${sample.id} 的第一个)`);
                } else {
                    console.log(`📝 样本 ${sample.id} 没有片段`);
                }
            }
        } catch (error) {
            console.error('获取片段列表失败:', error);
        }
    }
    
    // 选择样本的最后一个片段
    async selectLastSegmentOfSample(sample) {
        try {
            // 获取样本的片段列表
            const response = await fetch(`/api/sample/${sample.id}/segments`);
            if (response.ok) {
                const segments = await response.json();
                if (segments && segments.length > 0) {
                    // 标记需要选择的片段，在渲染完成后自动选择
                    this.pendingSegmentSelection = {
                        segment: segments[segments.length - 1],
                        sampleId: sample.id,
                        position: '最后一个'
                    };
                    console.log(`📝 标记待选择片段: ${segments[segments.length - 1].id} (${sample.id} 的最后一个)`);
                } else {
                    console.log(`📝 样本 ${sample.id} 没有片段`);
                }
            }
        } catch (error) {
            console.error('获取片段列表失败:', error);
        }
    }
    

    
    selectSegment(segment) {
        // 检查是否有选中的视频样本
        if (!this.currentSample) {
            alert('请先选择一个视频样本');
            return;
        }
        
        // 暂停当前播放的视频
        this.pauseCurrentVideo();
        
        // 重置进度条状态
        this.resetTimelineProgress();
        
        // 更新选中状态（通过 highlightSelectedSegment 统一处理）
        
        this.currentSegment = segment;
        
        // 重置为片段的原始时间（覆盖之前的临时修改）
        this.updateTimeDisplay(segment.start_time, segment.end_time);
        this.updateTimelineMarkers();
        
        // 更新时间输入框为片段的原始时间
        this.startTimeInput.value = this.formatTime(segment.start_time);
        this.endTimeInput.value = this.formatTime(segment.end_time);
        
        // 显示片段控制按钮
        this.showSegmentControls();
        
        // 更新导航按钮状态
        this.updateNavigationButtons();
        
        // 更新片段操作按钮状态
        this.updateSegmentActionButtons();
        
        // 高亮显示选中的片段
        this.highlightSelectedSegment();
        
        console.log('🔄 片段已选择，时间轴已重置为原始时间:', segment.start_time, '到', segment.end_time);
    }
    
    // 更新当前片段状态
    updateCurrentSegmentStatus(status) {
        if (this.currentSegment) {
            this.updateSegmentStatus(this.currentSegment.id, status);
        }
    }
    
    // 验证时间范围是否超出视频时长
    validateTimeRange(startTime, endTime) {
        if (!this.currentVideoElement || !this.currentVideoElement.duration) {
            console.warn('⚠️ 无法获取视频时长，跳过时间范围验证');
            return { valid: true, message: '' };
        }
        
        const videoDuration = this.currentVideoElement.duration;
        
        if (startTime < 0) {
            return { 
                valid: false, 
                message: `开始时间不能为负数。当前设置: ${this.formatTime(startTime)}` 
            };
        }
        
        if (endTime > videoDuration) {
            return { 
                valid: false, 
                message: `结束时间超出视频时长。当前设置: ${this.formatTime(endTime)}，视频时长: ${this.formatTime(videoDuration)}` 
            };
        }
        
        if (startTime >= endTime) {
            return { 
                valid: false, 
                message: `开始时间必须小于结束时间。当前设置: ${this.formatTime(startTime)} - ${this.formatTime(endTime)}` 
            };
        }
        
        return { valid: true, message: '' };
    }
    
    // 新增片段
    async createNewSegment() {
        if (!this.currentSample) {
            alert('请先选择一个视频样本');
            return;
        }
        
        // 获取当前时间轴的时间
        const startTime = this.parseTimeString(this.startTimeInput.value);
        const endTime = this.parseTimeString(this.endTimeInput.value);
        
        // 验证时间范围
        const timeValidation = this.validateTimeRange(startTime, endTime);
        if (!timeValidation.valid) {
            alert(`时间范围无效：\n\n${timeValidation.message}\n\n请调整时间轴区间后重试。`);
            return;
        }
        
        // 二次确认
        if (!confirm(`确定要创建新片段吗？\n\n开始时间: ${this.formatTime(startTime)}\n结束时间: ${this.formatTime(endTime)}\n视频时长: ${this.currentVideoElement ? this.formatTime(this.currentVideoElement.duration) : '未知'}`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            // 创建新片段数据
            const newSegment = {
                id: 'segment_' + Date.now(),
                video_paths: this.currentSample.type === 'single_video' ? [this.currentSample.video_path] : this.currentSample.video_paths,
                start_time: startTime,
                end_time: endTime,
                status: '待抉择',
                sample_id: this.currentSample.id
            };
            
            // 调用后端API创建片段
            const response = await fetch('/api/segment/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newSegment)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 重新加载片段列表以确保数据同步
                    this.loadSampleSegments(this.currentSample.id);
                    alert('片段创建成功！');
                    console.log('✅ 新片段已创建并保存:', newSegment);
                } else {
                    throw new Error('服务器返回创建失败');
                }
            } else {
                throw new Error('创建片段请求失败');
            }
        } catch (error) {
            console.error('Error creating segment:', error);
            alert('创建片段失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    // 批量创建片段
    async batchCreateSegments() {
        if (!this.currentSample) {
            alert('请先选择一个视频样本');
            return;
        }
        
        // 获取当前时间轴的时间范围
        const rangeStartTime = this.parseTimeString(this.startTimeInput.value);
        const rangeEndTime = this.parseTimeString(this.endTimeInput.value);
        
        // 验证时间范围
        const timeValidation = this.validateTimeRange(rangeStartTime, rangeEndTime);
        if (!timeValidation.valid) {
            alert(`时间范围无效：\n\n${timeValidation.message}\n\n请调整时间轴区间后重试。`);
            return;
        }
        
        // 提示用户输入片段长度
        const segmentDurationInput = prompt(
            `当前选择区间: ${this.formatTime(rangeStartTime)} - ${this.formatTime(rangeEndTime)}\n` +
            `区间总时长: ${this.formatTime(rangeEndTime - rangeStartTime)}\n` +
            `视频时长: ${this.currentVideoElement ? this.formatTime(this.currentVideoElement.duration) : '未知'}\n\n` +
            `请输入每个片段的时长（秒）:`,
            '10'
        );
        
        if (!segmentDurationInput) {
            return; // 用户取消
        }
        
        const segmentDuration = parseFloat(segmentDurationInput);
        if (isNaN(segmentDuration) || segmentDuration <= 0) {
            alert('请输入有效的片段时长（大于0的数字）');
            return;
        }
        
        // 计算将要创建的片段数量
        const totalDuration = rangeEndTime - rangeStartTime;
        const segmentCount = Math.floor(totalDuration / segmentDuration);
        
        if (segmentCount === 0) {
            alert('片段时长过长，无法在当前区间内创建片段');
            return;
        }
        
        // 最终确认
        const remainingTime = totalDuration - (segmentCount * segmentDuration);
        let confirmMessage = `将在区间 ${this.formatTime(rangeStartTime)} - ${this.formatTime(rangeEndTime)} 内创建 ${segmentCount} 个片段\n\n`;
        confirmMessage += `每个片段时长: ${this.formatTime(segmentDuration)}\n`;
        confirmMessage += `总占用时长: ${this.formatTime(segmentCount * segmentDuration)}\n`;
        if (remainingTime > 0) {
            confirmMessage += `剩余时长: ${this.formatTime(remainingTime)} (将被忽略)\n`;
        }
        confirmMessage += `\n确定要批量创建这些片段吗？`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            this.showLoading();
            
            // 批量创建片段
            const createdSegments = [];
            for (let i = 0; i < segmentCount; i++) {
                const segmentStartTime = rangeStartTime + (i * segmentDuration);
                const segmentEndTime = segmentStartTime + segmentDuration;
                
                const newSegment = {
                    id: 'segment_' + Date.now() + '_' + i,
                    video_paths: this.currentSample.type === 'single_video' ? [this.currentSample.video_path] : this.currentSample.video_paths,
                    start_time: segmentStartTime,
                    end_time: segmentEndTime,
                    status: '待抉择',
                    sample_id: this.currentSample.id
                };
                
                // 调用后端API创建片段
                const response = await fetch('/api/segment/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(newSegment)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        createdSegments.push(newSegment);
                        console.log(`✅ 批量片段 ${i + 1}/${segmentCount} 已创建:`, newSegment);
                    } else {
                        throw new Error(`创建第 ${i + 1} 个片段失败`);
                    }
                } else {
                    throw new Error(`创建第 ${i + 1} 个片段请求失败`);
                }
                
                // 添加小延迟避免过快的请求
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 重新加载片段列表
            this.loadSampleSegments(this.currentSample.id);
            
            alert(`批量创建成功！共创建了 ${createdSegments.length} 个片段`);
            console.log('✅ 批量创建片段完成:', createdSegments);
            
        } catch (error) {
            console.error('Error batch creating segments:', error);
            alert('批量创建片段失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    // 按预设时间间隔批量创建片段
    async batchCreateSegmentsWithInterval(intervalSeconds) {
        if (!this.currentSample) {
            alert('请先选择一个视频样本');
            return;
        }
        
        // 获取当前时间轴的时间范围
        const rangeStartTime = this.parseTimeString(this.startTimeInput.value);
        const rangeEndTime = this.parseTimeString(this.endTimeInput.value);
        
        // 验证时间范围
        const timeValidation = this.validateTimeRange(rangeStartTime, rangeEndTime);
        if (!timeValidation.valid) {
            alert(`时间范围无效：\n\n${timeValidation.message}\n\n请调整时间轴区间后重试。`);
            return;
        }
        
        // 计算将要创建的片段数量
        const totalDuration = rangeEndTime - rangeStartTime;
        const segmentCount = Math.floor(totalDuration / intervalSeconds);
        
        if (segmentCount === 0) {
            alert(`时间间隔过长（${intervalSeconds}秒），无法在当前区间内创建片段\n\n当前区间时长: ${this.formatTime(totalDuration)}`);
            return;
        }
        
        // 二次确认
        const remainingTime = totalDuration - (segmentCount * intervalSeconds);
        let confirmMessage = `将在区间 ${this.formatTime(rangeStartTime)} - ${this.formatTime(rangeEndTime)} 内创建 ${segmentCount} 个片段\n\n`;
        confirmMessage += `每个片段时长: ${this.formatTime(intervalSeconds)}\n`;
        confirmMessage += `总占用时长: ${this.formatTime(segmentCount * intervalSeconds)}\n`;
        if (remainingTime > 0) {
            confirmMessage += `剩余时长: ${this.formatTime(remainingTime)} (将被忽略)\n`;
        }
        confirmMessage += `\n确定要按 ${intervalSeconds} 秒间隔批量创建这些片段吗？`;
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        try {
            this.showLoading();
            
            // 批量创建片段
            const createdSegments = [];
            for (let i = 0; i < segmentCount; i++) {
                const segmentStartTime = rangeStartTime + (i * intervalSeconds);
                const segmentEndTime = segmentStartTime + intervalSeconds;
                
                const newSegment = {
                    id: 'segment_' + Date.now() + '_' + i,
                    video_paths: this.currentSample.type === 'single_video' ? [this.currentSample.video_path] : this.currentSample.video_paths,
                    start_time: segmentStartTime,
                    end_time: segmentEndTime,
                    status: '待抉择',
                    sample_id: this.currentSample.id
                };
                
                // 调用后端API创建片段
                const response = await fetch('/api/segment/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(newSegment)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        createdSegments.push(newSegment);
                        console.log(`✅ 预设间隔片段 ${i + 1}/${segmentCount} 已创建:`, newSegment);
                    } else {
                        throw new Error(`创建第 ${i + 1} 个片段失败`);
                    }
                } else {
                    throw new Error(`创建第 ${i + 1} 个片段请求失败`);
                }
                
                // 添加小延迟避免过快的请求
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // 重新加载片段列表
            this.loadSampleSegments(this.currentSample.id);
            
            alert(`按 ${intervalSeconds} 秒间隔批量创建成功！共创建了 ${createdSegments.length} 个片段`);
            console.log('✅ 预设间隔批量创建片段完成:', createdSegments);
            
        } catch (error) {
            console.error('Error batch creating segments with interval:', error);
            alert('批量创建片段失败: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    // 修改片段时间
    async updateSegmentTime() {
        if (!this.currentSegment) {
            alert('请先选择一个片段');
            return;
        }
        
        // 获取当前时间轴的时间
        const startTime = this.parseTimeString(this.startTimeInput.value);
        const endTime = this.parseTimeString(this.endTimeInput.value);
        
        // 验证时间范围
        const timeValidation = this.validateTimeRange(startTime, endTime);
        if (!timeValidation.valid) {
            alert(`时间范围无效：\n\n${timeValidation.message}\n\n请调整时间轴区间后重试。`);
            return;
        }
        
        // 二次确认
        if (!confirm(`确定要将片段 "${this.currentSegment.id}" 的时间修改为当前区间吗？\n\n新开始时间: ${this.formatTime(startTime)}\n新结束时间: ${this.formatTime(endTime)}\n视频时长: ${this.currentVideoElement ? this.formatTime(this.currentVideoElement.duration) : '未知'}`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            // 调用后端API更新片段时间
            const response = await fetch(`/api/segment/${this.currentSegment.id}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    start_time: startTime,
                    end_time: endTime
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // 更新前端数据
                    this.currentSegment.start_time = startTime;
                    this.currentSegment.end_time = endTime;
                    
                    // 更新时间轴标记
                    this.updateTimelineMarkers();
                    
                    // 更新时间输入框（保持与后台数据一致）
                    this.startTimeInput.value = this.formatTime(startTime);
                    this.endTimeInput.value = this.formatTime(endTime);
                    
                    // 更新片段列表显示
                    this.updateSegmentInList(this.currentSegment);
                    
                    alert('片段时间修改成功！现在播放区间与后台数据已同步。');
                    console.log('✅ 片段时间已更新并保存:', this.currentSegment);
                } else {
                    throw new Error('服务器返回更新失败');
                }
            } else {
                throw new Error('更新片段时间请求失败');
            }
        } catch (error) {
            console.error('Error updating segment time:', error);
            alert('修改片段时间失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    // 添加片段到列表
    addSegmentToList(segment) {
        const segmentsList = document.getElementById('segmentList');
        if (segmentsList) {
            const segmentElement = this.createSegmentElement(segment);
            segmentsList.appendChild(segmentElement);
            
            // 自动选择新创建的片段
            this.selectSegment(segment);
        }
    }
    
    // 更新片段在列表中的显示
    updateSegmentInList(segment) {
        const segmentElement = document.querySelector(`[data-segment-id="${segment.id}"]`);
        if (segmentElement) {
            // 更新时间显示
            const timeElement = segmentElement.querySelector('.segment-time');
            if (timeElement) {
                timeElement.textContent = `${this.formatTime(segment.start_time)} - ${this.formatTime(segment.end_time)}`;
            }
            
            // 更新状态显示
            const statusElement = segmentElement.querySelector('.segment-status-badge');
            if (statusElement) {
                statusElement.className = `segment-status-badge ${this.getSegmentStatusClass(segment.status)}`;
                statusElement.textContent = this.getSegmentStatusText(segment.status);
            }
        }
    }
    
    // 显示片段控制按钮
    showSegmentControls() {
        const statusControls = document.getElementById('segmentStatusControls');
        const updateTimeBtn = document.getElementById('updateSegmentTimeBtn');
        const deleteBtn = document.getElementById('deleteSegmentBtn');
        const commentSection = document.getElementById('segmentCommentSection');
        
        if (statusControls) statusControls.style.display = 'flex';
        if (updateTimeBtn) updateTimeBtn.style.display = 'inline-block';
        if (deleteBtn) deleteBtn.style.display = 'inline-block';
        
        // 显示注释区域并更新内容
        if (commentSection) {
            commentSection.style.display = 'block';
            this.updateSegmentCommentTextarea();
        }
        
        console.log('✅ 片段控制按钮已显示');
    }
    
    // 隐藏片段控制按钮
    hideSegmentControls() {
        const statusControls = document.getElementById('segmentStatusControls');
        const updateTimeBtn = document.getElementById('updateSegmentTimeBtn');
        const deleteBtn = document.getElementById('deleteSegmentBtn');
        const commentSection = document.getElementById('segmentCommentSection');
        
        if (statusControls) statusControls.style.display = 'none';
        if (updateTimeBtn) updateTimeBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (commentSection) commentSection.style.display = 'none';
        
        console.log('✅ 片段控制按钮已隐藏');
    }
    
    // 更新片段注释文本框
    updateSegmentCommentTextarea() {
        const commentTextarea = document.getElementById('segmentCommentTextarea');
        if (!commentTextarea || !this.currentSegment) return;
        
        const comment = this.currentSegment.comment || '';
        commentTextarea.value = comment;
        
        // 添加实时保存的事件监听器
        this.setupCommentTextareaListener();
    }
    
    // 设置注释文本框的事件监听器
    setupCommentTextareaListener() {
        const commentTextarea = document.getElementById('segmentCommentTextarea');
        if (!commentTextarea) return;
        
        // 移除之前的事件监听器（避免重复绑定）
        commentTextarea.removeEventListener('input', this.handleCommentInput);
        
        // 添加新的事件监听器
        this.handleCommentInput = (e) => {
            this.saveSegmentComment(this.currentSegment.id, e.target.value);
        };
        commentTextarea.addEventListener('input', this.handleCommentInput);
    }
    

    
    async updateSegmentStatus(segmentId, status) {
        try {
            const response = await fetch(`/api/segment/${segmentId}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status })
            });
            
            if (response.ok) {
                // 更新本地片段数据，不重新加载列表
                if (this.currentSegmentList) {
                    const segment = this.currentSegmentList.find(s => s.id === segmentId);
                    if (segment) {
                        segment.status = status;
                    }
                }
                
                // 更新当前选中的片段状态
                if (this.currentSegment && this.currentSegment.id === segmentId) {
                    this.currentSegment.status = status;
                }
                
                // 更新片段列表显示（不重新排序）
                if (this.currentSegmentList) {
                    this.renderSegments(this.currentSegmentList);
                }
                
                // 更新片段操作按钮
                this.updateSegmentActionButtons();
                
                console.log(`✅ 片段 ${segmentId} 状态已更新为: ${status}`);
            } else {
                throw new Error('Failed to update segment status');
            }
        } catch (error) {
            console.error('Error updating segment status:', error);
            alert('更新片段状态失败，请重试');
        }
    }
    
    async removeRejectedSegments() {
        if (!this.currentDataset) {
            alert('请先选择一个数据集');
            return;
        }
        
        // 获取数据集ID，处理currentDataset可能是对象的情况
        const datasetId = typeof this.currentDataset === 'string' ? this.currentDataset : this.currentDataset.id;
        
        if (!datasetId) {
            alert('无法获取数据集ID');
            return;
        }
        
        if (!confirm('确定要删除所有弃用的片段吗？此操作不可撤销。')) {
            return;
        }
        
        try {
            this.showLoading();
            
            console.log(`🗑️ 开始删除数据集 ${datasetId} 的弃用片段`);
            
            const response = await fetch(`/api/dataset/${datasetId}/remove_rejected`, {
                method: 'POST'
            });
            
            if (response.ok) {
                // 重新加载片段列表
                this.loadSegments(datasetId);
                if (this.currentSample) {
                    this.loadSampleSegments(this.currentSample.id);
                }
                alert('弃用片段删除成功');
                console.log(`✅ 数据集 ${datasetId} 的弃用片段删除成功`);
            } else {
                throw new Error('Failed to remove rejected segments');
            }
        } catch (error) {
            console.error('Error removing rejected segments:', error);
            alert('删除弃用片段失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    // 删除当前选中的片段
    async deleteCurrentSegment() {
        if (!this.currentSegment) {
            alert('请先选择一个片段');
            return;
        }
        
        if (!confirm(`确定要删除片段 "${this.currentSegment.name}" 吗？此操作不可撤销。`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            const response = await fetch(`/api/segment/${this.currentSegment.id}/delete`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // 从片段列表中移除
                this.currentSegmentList = this.currentSegmentList.filter(s => s.id !== this.currentSegment.id);
                
                // 清除当前选中的片段
                this.currentSegment = null;
                
                // 重新渲染片段列表
                this.renderSegments(this.currentSegmentList);
                
                // 隐藏相关按钮
                this.updateSegmentActionButtons();
                
                // 重置时间轴
                this.initializeDefaultTimeline();
                
                alert('片段删除成功');
            } else {
                throw new Error('Failed to delete segment');
            }
        } catch (error) {
            console.error('Error deleting segment:', error);
            alert('删除片段失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    // 标记当前视频为已审阅
    async markVideoAsReviewed() {
        if (!this.currentSample) {
            alert('请先选择一个视频');
            return;
        }
        
        if (!confirm(`确定要将视频 "${this.currentSample.name}" 标记为已审阅吗？`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            const response = await fetch(`/api/sample/${this.currentSample.id}/mark_reviewed`, {
                method: 'POST'
            });
            
            if (response.ok) {
                // 更新样本状态
                this.currentSample.review_status = '已审阅';
                
                // 更新UI显示
                this.updateSampleReviewStatus();
                
                // 隐藏标记按钮
                this.updateVideoActionButtons();
                
                alert('视频已标记为已审阅');
            } else {
                throw new Error('Failed to mark video as reviewed');
            }
        } catch (error) {
            console.error('Error marking video as reviewed:', error);
            alert('标记视频为已审阅失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    
    // 标记当前视频为未审阅
    async markVideoAsUnreviewed() {
        if (!this.currentSample) {
            alert('请先选择一个视频');
            return;
        }
        
        if (!confirm(`确定要将视频 "${this.currentSample.name}" 重新设置为未审阅吗？`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            const response = await fetch(`/api/sample/${this.currentSample.id}/mark_unreviewed`, {
                method: 'POST'
            });
            
            if (response.ok) {
                // 更新样本状态
                this.currentSample.review_status = '未审阅';
                
                // 更新UI显示
                this.updateSampleReviewStatus();
                
                // 隐藏标记按钮
                this.updateVideoActionButtons();
                
                alert('视频已重新设置为未审阅');
            } else {
                throw new Error('Failed to mark video as unreviewed');
            }
        } catch (error) {
            console.error('Error marking video as unreviewed:', error);
            alert('设置视频为未审阅失败，请重试');
        } finally {
            this.hideLoading();
        }
    }
    

    
    // 更新样本审阅状态显示
    updateSampleReviewStatus() {
        if (!this.currentSample) return;
        
        // 更新样本列表中的状态显示
        const sampleElement = document.querySelector(`[data-sample-id="${this.currentSample.id}"]`);
        if (sampleElement) {
            const statusElement = sampleElement.querySelector('.review-status');
            if (statusElement) {
                statusElement.textContent = this.currentSample.review_status;
                statusElement.className = `review-status ${this.getReviewStatusClass(this.currentSample.review_status)}`;
            }
        }
        
        // 重新加载样本列表以确保状态同步
        if (this.currentDataset) {
            this.loadSamples(this.currentDataset.id);
        }
    }
    
    initializeVideoPlayer() {
        this.videoPlayer = document.getElementById('videoPlayer');
        this.startMarker = document.getElementById('startMarker');
        this.endMarker = document.getElementById('endMarker');
        this.startTimeInput = document.getElementById('startTimeInput');
        this.endTimeInput = document.getElementById('endTimeInput');
        
        console.log('🎬 初始化视频播放器容器');
        
        // 时间输入框现在是只读的，显示当前时间轴选择
        
        // 设置时间轴标记拖动事件
        this.setupTimelineDrag();
        
        // 初始化时隐藏视频播放区域和时间轴
        this.hideVideoPlayer();
        
        // 初始化时容器为空，视频将在选择样本时动态创建
        console.log('🎬 视频播放器初始化完成');
    }
    
    updateVideoPlayer(sample) {
        // console.log('🎬 更新视频播放器，样本: ' + sample.name);
        
        // 显示视频播放区域和时间轴
        this.showVideoPlayer();
        
        // 停止之前的同步监控
        this.stopSyncMonitoring();
        
        // 重置进度条状态
        this.resetTimelineProgress();
        
        // 清空容器
        this.videoPlayer.innerHTML = '';
        
        if (sample.type === 'youtube') {
            // console.log('📺 设置YouTube视频（使用本地下载的文件）');
            // 对于YouTube视频，使用本地下载的文件路径
            // 构造本地视频路径：/static/videos/数据集名/样本名/样本名_youtube.mp4
            let datasetId = 'test_dataset'; // 默认使用test_dataset
            
            // 尝试从多个来源获取数据集ID
            if (this.currentDataset && this.currentDataset.id) {
                datasetId = this.currentDataset.id;
            } else if (sample.dataset_id) {
                datasetId = sample.dataset_id;
            } else if (this.currentDatasetName) {
                datasetId = this.currentDatasetName;
            }
            
            const localVideoPath = `/static/videos/${datasetId}/${sample.id}/${sample.id}_youtube.mp4`;
            // console.log('📁 YouTube本地视频路径:', {
            //     datasetId: datasetId,
            //     sampleId: sample.id,
            //     fullPath: localVideoPath,
            //     currentDataset: this.currentDataset,
            //     currentDatasetName: this.currentDatasetName
            // });
            this.setupSingleVideo(localVideoPath);
        } else if (sample.type === 'multiple_videos') {
            // console.log('🎬 设置多视频同步播放');
            this.setupMultipleVideos(sample.video_paths);
        } else {
            // console.log('🎥 设置单视频');
            this.setupSingleVideo(sample.video_path);
        }
        
        // 视频切换后，直接重置时间轴到默认状态（0-10秒）
        setTimeout(() => {
            this.initializeDefaultTimeline();
            // console.log('🔄 视频切换后时间轴已重置到默认状态');
        }, 300);
    }
    

    
    // 设置单视频播放
    setupSingleVideo(videoPath) {
        console.log('📁 单视频路径: ' + videoPath);
        
        // 检查容器是否存在
        if (!this.videoPlayer) {
            console.error('❌ 视频容器不存在！');
            return;
        }
        
        console.log('📦 视频容器状态:', {
            element: this.videoPlayer,
            id: this.videoPlayer.id,
            innerHTML: this.videoPlayer.innerHTML,
            clientWidth: this.videoPlayer.clientWidth,
            clientHeight: this.videoPlayer.clientHeight
        });
        
        // 创建新的video元素
        const video = document.createElement('video');
        video.controls = true;
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.maxHeight = '400px';
        video.style.display = 'block';
        video.style.backgroundColor = '#000';
        
        // 添加预加载属性
        video.preload = 'metadata';
        
        // 设置视频源 - 使用source元素提供更好的格式支持
        const source = document.createElement('source');
        source.src = videoPath;
        source.type = 'video/mp4';
        video.appendChild(source);
        
        // 调试信息
        console.log('🎬 视频元素配置:', {
            videoPath: videoPath,
            sourceSrc: source.src,
            sourceType: source.type,
            videoReadyState: video.readyState,
            videoNetworkState: video.networkState
        });
        
        // 绑定完整的事件监听器
        this.bindVideoEvents(video);
        
        // 添加到容器
        console.log('🔗 将视频元素添加到容器...');
        this.videoPlayer.appendChild(video);
        
        // 保存引用
        this.currentVideoElement = video;
        this.videoElements = [video];
        
        // 强制加载视频
        video.load();
        
        console.log('🎬 单视频元素已创建并添加到DOM');
        console.log('🎯 当前DOM结构:', this.videoPlayer.innerHTML.substring(0, 200));
    }
    
    // 设置多视频选择播放器
    setupMultipleVideos(videoPaths) {
        console.log('📁 多视频路径: ' + videoPaths);
        
        // 检查容器是否存在
        if (!this.videoPlayer) {
            console.error('❌ 视频容器不存在！');
            return;
        }
        
        // 创建视频选择器容器
        const videoSelectorContainer = document.createElement('div');
        videoSelectorContainer.className = 'video-selector-container';
        videoSelectorContainer.style.padding = '20px';
        videoSelectorContainer.style.backgroundColor = '#ffffff';
        videoSelectorContainer.style.border = '1px solid #ced4da';
        videoSelectorContainer.style.borderRadius = '8px';
        videoSelectorContainer.style.marginBottom = '20px';
        
        // 创建标题
        const title = document.createElement('h3');
        title.textContent = '选择要播放的视频视角';
        title.style.marginBottom = '15px';
        title.style.color = '#333';
        title.style.fontSize = '18px';
        videoSelectorContainer.appendChild(title);
        
        // 创建视频列表
        const videoList = document.createElement('div');
        videoList.className = 'video-list';
        videoList.style.display = 'grid';
        videoList.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        videoList.style.gap = '15px';
        
        // 为每个视频路径创建选择按钮
        videoPaths.forEach((videoPath, index) => {
            const videoButton = document.createElement('button');
            videoButton.className = 'video-select-button';
            videoButton.textContent = this.extractVideoFilename(videoPath);
            videoButton.style.padding = '12px 16px';
            videoButton.style.border = '2px solid #e9ecef';
            videoButton.style.borderRadius = '8px';
            videoButton.style.backgroundColor = '#ffffff';
            videoButton.style.color = '#495057';
            videoButton.style.cursor = 'pointer';
            videoButton.style.fontSize = '14px';
            videoButton.style.fontWeight = '500';
            videoButton.style.transition = 'all 0.2s ease';
            videoButton.style.textAlign = 'center';
            videoButton.style.wordBreak = 'break-word';
            
            // 添加悬停效果
            videoButton.addEventListener('mouseenter', () => {
                videoButton.style.borderColor = '#007bff';
                videoButton.style.backgroundColor = '#f8f9fa';
            });
            
            videoButton.addEventListener('mouseleave', () => {
                if (!videoButton.classList.contains('active')) {
                    videoButton.style.borderColor = '#e9ecef';
                    videoButton.style.backgroundColor = '#ffffff';
                }
            });
            
            // 添加点击事件
            videoButton.addEventListener('click', () => {
                // 移除其他按钮的active状态
                videoList.querySelectorAll('.video-select-button').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.borderColor = '#e9ecef';
                    btn.style.backgroundColor = '#ffffff';
                    btn.style.color = '#495057';
                });
                
                // 设置当前按钮为active状态 - 修复字体颜色问题
                videoButton.classList.add('active');
                videoButton.style.borderColor = '#007bff';
                videoButton.style.backgroundColor = '#e3f2fd'; // 使用浅蓝色背景
                videoButton.style.color = '#007bff'; // 保持蓝色字体，确保可读性
                
                // 播放选中的视频
                this.playSelectedVideo(videoPath, index);
            });
            
            videoList.appendChild(videoButton);
        });
        
        videoSelectorContainer.appendChild(videoList);
        
        // 创建视频播放区域
        const videoPlayArea = document.createElement('div');
        videoPlayArea.className = 'video-play-area';
        videoPlayArea.style.marginTop = '20px';
        videoPlayArea.style.padding = '20px';
        videoPlayArea.style.backgroundColor = '#f8f9fa';
        videoPlayArea.style.border = '1px solid #dee2e6';
        videoPlayArea.style.borderRadius = '8px';
        videoPlayArea.style.minHeight = '400px';
        videoPlayArea.style.display = 'flex';
        videoPlayArea.style.alignItems = 'center';
        videoPlayArea.style.justifyContent = 'center';
        
        // 添加提示文字
        const placeholder = document.createElement('div');
        placeholder.textContent = '请选择一个视频视角开始播放';
        placeholder.style.color = '#6c757d';
        placeholder.style.fontSize = '16px';
        placeholder.style.fontWeight = '500';
        videoPlayArea.appendChild(placeholder);
        
        videoSelectorContainer.appendChild(videoPlayArea);
        
        // 添加到主容器
        this.videoPlayer.appendChild(videoSelectorContainer);
        
        // 保存引用
        this.videoSelectorContainer = videoSelectorContainer;
        this.videoPlayArea = videoPlayArea;
        this.videoPaths = videoPaths;
        
        console.log('🎬 多视频选择器已创建');
    }
    
    // 播放选中的视频
    playSelectedVideo(videoPath, index) {
        console.log(`🎬 播放选中的视频: ${videoPath}`);
        
        // 保存当前的时间轴状态 - 使用更可靠的方式
        const currentStartTime = this.getCurrentStartTime();
        const currentEndTime = this.getCurrentEndTime();
        const currentSegment = this.currentSegment;
        
        console.log(`💾 保存时间轴状态: 开始=${currentStartTime}, 结束=${currentEndTime}, 片段=${currentSegment ? currentSegment.id : '无'}`);
        
        // 清空播放区域
        this.videoPlayArea.innerHTML = '';
        
        // 创建视频元素
        const video = document.createElement('video');
        video.controls = true;
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.maxHeight = '500px';
        video.style.borderRadius = '8px';
        video.style.backgroundColor = '#000';
        
        // 设置视频源
        const source = document.createElement('source');
        source.src = videoPath;
        source.type = 'video/mp4';
        video.appendChild(source);
        video.src = videoPath;
        
        // 绑定事件监听器
        this.bindVideoEvents(video);
        
        // 添加到播放区域
        this.videoPlayArea.appendChild(video);
        
        // 设置当前视频引用
        this.currentVideoElement = video;
        this.videoElements = [video];
        
        // 加载视频
        video.load();
        
        // 恢复时间轴状态 - 使用延迟确保DOM元素已准备好
        setTimeout(() => {
            this.restoreTimelineState(currentStartTime, currentEndTime, currentSegment);
        }, 100);
        
        console.log(`✅ 视频${index + 1}开始播放，时间轴状态恢复中...`);
    }
    
    // 获取当前开始时间
    getCurrentStartTime() {
        // 尝试多种方式获取开始时间
        if (this.startTimeInput && this.startTimeInput.value) {
            return this.startTimeInput.value;
        }
        
        // 从DOM中直接查找
        const startTimeInput = document.getElementById('startTimeInput');
        if (startTimeInput && startTimeInput.value) {
            return startTimeInput.value;
        }
        
        // 从时间轴标记获取
        if (this.startMarker && this.startMarker.style.left) {
            const leftPercent = parseFloat(this.startMarker.style.left) / 100;
            const duration = this.currentVideoElement ? this.currentVideoElement.duration : 10;
            return this.formatTime(leftPercent * duration);
        }
        
        return '';
    }
    
    // 获取当前结束时间
    getCurrentEndTime() {
        // 尝试多种方式获取结束时间
        if (this.endTimeInput && this.endTimeInput.value) {
            return this.endTimeInput.value;
        }
        
        // 从DOM中直接查找
        const endTimeInput = document.getElementById('endTimeInput');
        if (endTimeInput && endTimeInput.value) {
            return endTimeInput.value;
        }
        
        // 从时间轴标记获取
        if (this.endMarker && this.endMarker.style.left) {
            const leftPercent = parseFloat(this.endMarker.style.left) / 100;
            const duration = this.currentVideoElement ? this.currentVideoElement.duration : 10;
            return this.formatTime(leftPercent * duration);
        }
        
        return '';
    }
    
    // 恢复时间轴状态
    restoreTimelineState(startTime, endTime, segment) {
        console.log(`🔄 恢复时间轴状态: 开始=${startTime}, 结束=${endTime}, 片段=${segment ? segment.id : '无'}`);
        
        // 恢复输入框值
        if (startTime) {
            if (this.startTimeInput) {
                this.startTimeInput.value = startTime;
                console.log(`✅ 恢复开始时间: ${startTime}`);
            } else {
                const startTimeInput = document.getElementById('startTimeInput');
                if (startTimeInput) {
                    startTimeInput.value = startTime;
                    console.log(`✅ 通过DOM查找恢复开始时间: ${startTime}`);
                }
            }
        }
        
        if (endTime) {
            if (this.endTimeInput) {
                this.endTimeInput.value = endTime;
                console.log(`✅ 恢复结束时间: ${endTime}`);
            } else {
                const endTimeInput = document.getElementById('endTimeInput');
                if (endTimeInput) {
                    endTimeInput.value = endTime;
                    console.log(`✅ 通过DOM查找恢复结束时间: ${endTime}`);
                }
            }
        }
        
        // 恢复片段状态
        if (segment) {
            this.currentSegment = segment;
            // 更新片段在UI中的显示状态
            this.updateSegmentInList(segment);
            console.log(`✅ 恢复片段状态: ${segment.id}`);
        }
        
        // 根据恢复的时间值更新时间轴标记位置
        if (startTime && endTime) {
            // 将时间字符串转换为秒数
            const startSeconds = this.parseTimeString(startTime);
            const endSeconds = this.parseTimeString(endTime);
            
            if (startSeconds !== null && endSeconds !== null) {
                this.updateTimelineMarkersFromTime(startSeconds, endSeconds);
            }
        }
        
        console.log(`🎯 时间轴状态恢复完成`);
    }
    
    // 提取视频文件名
    extractVideoFilename(videoPath) {
        // 从路径中提取文件名
        const pathParts = videoPath.split('/');
        const filename = pathParts[pathParts.length - 1];
        
        // 移除文件扩展名
        const nameWithoutExt = filename.replace(/\.(mp4|avi|mov|mkv)$/i, '');
        
        // 美化显示名称
        return this.formatVideoDisplayName(nameWithoutExt);
    }
    
    // 格式化视频显示名称
    formatVideoDisplayName(name) {
        // 将下划线和连字符替换为空格
        let displayName = name.replace(/[_-]/g, ' ');
        
        // 将驼峰命名转换为空格分隔
        displayName = displayName.replace(/([a-z])([A-Z])/g, '$1 $2');
        
        // 首字母大写
        displayName = displayName.replace(/\b\w/g, l => l.toUpperCase());
        
        return displayName;
    }
    
    // 切换播放/暂停状态（支持多视频）
    togglePlayPause() {
        if (this.videoElements && this.videoElements.length > 0) {
            // 多视频情况：检查第一个视频的状态来决定操作
            const firstVideo = this.videoElements[0];
            if (firstVideo.paused) {
                this.resumeVideo();
            } else {
                this.pauseVideo();
            }
        } else if (this.currentVideoElement) {
            // 单视频情况
            if (this.currentVideoElement.paused) {
                this.resumeVideo();
            } else {
                this.pauseVideo();
            }
        }
    }
    
    // 等待所有视频就绪
    waitForVideosReady() {
        if (!this.videoElements || this.videoElements.length === 0) {
            return;
        }
        
        console.log('⏳ 等待所有视频就绪...');
        
        let readyCount = 0;
        const totalVideos = this.videoElements.length;
        
        this.videoElements.forEach((video, index) => {
            const checkReady = () => {
                if (video.readyState >= 1) { // HAVE_METADATA
                    readyCount++;
                    console.log(`✅ 视频${index + 1}就绪 (${readyCount}/${totalVideos})`);
                    
                    if (readyCount === totalVideos) {
                        console.log('🎉 所有视频都已就绪，启用播放控制');
                        this.enableVideoControls();
                        
                        // 启动智能资源管理
                        this.startSmartResourceManagement();
                    }
                } else {
                    // 如果还没就绪，继续等待
                    setTimeout(checkReady, 100);
                }
            };
            
            checkReady();
        });
    }
    
    // 启动智能资源管理
    startSmartResourceManagement() {
        console.log('🧠 启动智能资源管理...');
        
        // 每3秒检查一次视频状态
        this.resourceManagementInterval = setInterval(() => {
            this.manageVideoResources();
        }, 3000);
    }
    
    // 管理视频资源
    manageVideoResources() {
        if (!this.videoElements || this.videoElements.length === 0) {
            return;
        }
        
        this.videoElements.forEach((video, index) => {
            const isInViewport = this.isVideoInViewport(video);
            const isPlaying = !video.paused;
            
            // 如果视频不在视口内且正在播放，暂停它
            if (!isInViewport && isPlaying) {
                console.log(`⏸️ 视频${index + 1}不在视口内，自动暂停以节省资源`);
                video.pause();
            }
            
            // 如果视频在视口内且暂停，可以考虑恢复播放
            if (isInViewport && video.paused && this.shouldAutoResume(video)) {
                console.log(`▶️ 视频${index + 1}在视口内，自动恢复播放`);
                video.play().catch(e => console.warn('自动恢复播放失败:', e));
            }
        });
    }
    
    // 判断是否应该自动恢复播放
    shouldAutoResume(video) {
        // 只有在用户主动播放过的情况下才自动恢复
        return video.dataset.userPlayed === 'true';
    }
    
    // 启用视频控制
    enableVideoControls() {
        this.videoElements.forEach(video => {
            video.style.pointerEvents = 'auto';
            video.style.opacity = '1';
        });
        
        console.log('🎮 视频控制已启用');
    }
    
    // 启动内存监控
    startMemoryMonitoring() {
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
        }
        
        this.memoryMonitorInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, 5000); // 每5秒检查一次内存使用
        
        console.log('🧠 内存监控已启动，监控间隔: 5秒');
    }
    
    // 停止内存监控
    stopMemoryMonitoring() {
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
        }
    }
    
    // 检查内存使用情况
    checkMemoryUsage() {
        if (this.videoElements && this.videoElements.length > 0) {
            console.log('🧠 检查内存使用情况...');
            
            let totalBufferedTime = 0;
            let videosToCleanup = [];
            
            // 检查所有视频的缓冲状态
            this.videoElements.forEach((video, index) => {
                if (video.buffered && video.buffered.length > 0) {
                    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    const currentTime = video.currentTime;
                    const bufferedAhead = bufferedEnd - currentTime;
                    
                    totalBufferedTime += bufferedAhead;
                    
                    // 如果缓冲区域过大，标记为需要清理
                    if (bufferedAhead > 20) { // 减少到20秒
                        videosToCleanup.push({ video, index, bufferedAhead });
                        console.log(`⚠️ 视频${index + 1}缓冲过多: ${bufferedAhead.toFixed(1)}秒`);
                    }
                }
            });
            
            console.log(`📊 总缓冲时间: ${totalBufferedTime.toFixed(1)}秒`);
            
            // 如果总缓冲时间过多，清理最严重的几个
            if (totalBufferedTime > 100) { // 总缓冲超过100秒
                console.log('🚨 总缓冲时间过多，开始清理...');
                
                // 按缓冲时间排序，清理最严重的
                videosToCleanup.sort((a, b) => b.bufferedAhead - a.bufferedAhead);
                
                // 清理前3个最严重的
                videosToCleanup.slice(0, 3).forEach(({ video, index }) => {
                    console.log(`🧹 清理视频${index + 1}的过度缓冲`);
                    this.cleanupVideoBuffer(video);
                });
            }
        }
    }
    
    // 清理视频缓冲
    cleanupVideoBuffer(video) {
        try {
            // 注意：buffered是只读属性，不能直接赋值
            // 我们通过其他方式优化内存使用
            
            // 如果视频暂停且不在视口内，可以进一步优化
            if (video.paused && !this.isVideoInViewport(video)) {
                // 重新加载视频以减少内存占用
                const currentSrc = video.src;
                video.src = '';
                video.src = currentSrc;
            }
        } catch (e) {
            console.warn('清理视频缓冲时出错:', e);
        }
    }
    
    // 检查视频是否在视口内
    isVideoInViewport(video) {
        const rect = video.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
    
    // 绑定视频事件监听器
    bindVideoEvents(video) {
        video.addEventListener('loadstart', () => {
            console.log('🔄 视频开始加载');
        });
        
        video.addEventListener('canplay', () => {
            console.log('✅ 视频可以播放');
            console.log('🎥 视频尺寸: ' + video.videoWidth + 'x' + video.videoHeight);
            console.log('🎥 视频时长: ' + video.duration + '秒');
        });
        
        video.addEventListener('timeupdate', () => {
            this.updateTimelineProgress();
        });
        
        video.addEventListener('error', (e) => {
            console.log('❌ 视频加载错误');
            if (video.error) {
                console.log('错误代码: ' + video.error.code);
                console.log('错误消息: ' + video.error.message);
                
                // 显示用户友好的错误信息
                let customMessage = null;
                if (video.error.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
                    customMessage = '视频格式不支持，请尝试重新下载视频';
                }
                
                this.showVideoError(video, video.error, customMessage);
            }
        });
        
        video.addEventListener('loadedmetadata', () => {
            console.log('📊 视频元数据已加载');
            console.log('🎥 视频尺寸: ' + video.videoWidth + 'x' + video.videoHeight);
            console.log('🎥 视频时长: ' + video.duration + '秒');
            
            // 如果是第一个视频，初始化时间轴
            if (video === this.currentVideoElement) {
                setTimeout(() => {
                    this.initializeDefaultTimeline();
                }, 100);
            }
        });
        
        // 添加更多事件监听器
        video.addEventListener('load', () => {
            console.log('📥 视频加载完成');
        });
        
        video.addEventListener('canplaythrough', () => {
            console.log('🎯 视频可以流畅播放');
        });
        
        video.addEventListener('stalled', () => {
            console.log('⏸️ 视频加载停滞');
        });
        
        video.addEventListener('waiting', () => {
            console.log('⏳ 视频等待数据');
        });
        
        // 同步播放控制 - 添加防抖
        let playTimeout, pauseTimeout, seekTimeout;
        
        video.addEventListener('play', () => {
            clearTimeout(playTimeout);
            playTimeout = setTimeout(() => {
                this.syncVideoPlayback(video, 'play');
            }, 10); // 10ms防抖
        });
        
        video.addEventListener('pause', () => {
            clearTimeout(pauseTimeout);
            pauseTimeout = setTimeout(() => {
                this.syncVideoPlayback(video, 'pause');
            }, 10); // 10ms防抖
        });
        
        video.addEventListener('seeked', () => {
            clearTimeout(seekTimeout);
            seekTimeout = setTimeout(() => {
                this.syncVideoSeek(video);
            }, 20); // 20ms防抖
        });
    }
    
    // 显示视频错误信息
    showVideoError(video, error, customMessage = null) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'video-error-container';
        errorContainer.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            z-index: 1000;
            max-width: 300px;
        `;
        
        let errorMessage = '视频加载失败';
        let suggestion = '';
        
        // 如果有自定义消息，使用自定义消息
        if (customMessage) {
            errorMessage = customMessage;
            suggestion = '请尝试重新下载视频或联系管理员';
        } else if (error) {
            // 根据错误代码提供具体建议
            switch (error.code) {
                case 1:
                    errorMessage = '视频加载被中断';
                    suggestion = '请检查网络连接或刷新页面重试';
                    break;
                case 2:
                    errorMessage = '网络错误';
                    suggestion = '请检查网络连接，确保视频文件可访问';
                    break;
                case 3:
                    errorMessage = '视频解码失败';
                    suggestion = '视频文件可能损坏或格式不支持，请重新下载';
                    break;
                case 4:
                    errorMessage = '视频格式不支持';
                    suggestion = '浏览器不支持此视频格式，请尝试其他浏览器或重新下载';
                    break;
                default:
                    errorMessage = '未知错误';
                    suggestion = '请刷新页面重试或联系管理员';
            }
        }
        
        errorContainer.innerHTML = `
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">❌ ${errorMessage}</div>
            <div style="font-size: 14px; margin-bottom: 15px;">${suggestion}</div>
            <button onclick="this.parentElement.remove()" style="
                background: white; 
                color: red; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 4px; 
                cursor: pointer;
            ">关闭</button>
        `;
        
        // 将错误容器添加到视频播放器
        const videoContainer = video.parentElement;
        if (videoContainer) {
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(errorContainer);
        }
        
        // 5秒后自动隐藏错误信息
        setTimeout(() => {
            if (errorContainer.parentElement) {
                errorContainer.remove();
            }
        }, 5000);
    }
    
    // 同步视频播放状态
    syncVideoPlayback(triggerVideo, action) {
        if (!this.videoElements || this.videoElements.length <= 1) return;
        if (this.isSyncing) return; // 防止循环同步
        
        this.isSyncing = true;
        
        try {
            this.videoElements.forEach(async (video) => {
                if (video !== triggerVideo && video.readyState >= 2) { // 确保视频已加载
                    if (action === 'play') {
                        // 先同步时间再播放
                        if (Math.abs(video.currentTime - triggerVideo.currentTime) > this.syncThreshold) {
                            video.currentTime = triggerVideo.currentTime;
                        }
                        await video.play().catch(e => console.warn('视频播放失败:', e));
                    } else if (action === 'pause') {
                        video.pause();
                    }
                }
            });
        } finally {
            setTimeout(() => {
                this.isSyncing = false;
            }, 100); // 100ms后解除同步锁
        }
    }
    
    // 同步视频跳转
    syncVideoSeek(triggerVideo) {
        if (!this.videoElements || this.videoElements.length <= 1) return;
        if (this.isSyncing) return; // 防止循环同步
        
        const now = Date.now();
        if (now - this.lastSyncTime < 50) return; // 限制同步频率，避免过于频繁
        this.lastSyncTime = now;
        
        this.isSyncing = true;
        
        try {
            const targetTime = triggerVideo.currentTime;
            this.videoElements.forEach(video => {
                if (video !== triggerVideo && video.readyState >= 2 && !isNaN(video.duration)) {
                    // 只有时间差异超过阈值时才同步
                    if (Math.abs(video.currentTime - targetTime) > this.syncThreshold) {
                        video.currentTime = targetTime;
                    }
                }
            });
        } finally {
            setTimeout(() => {
                this.isSyncing = false;
            }, 50);
        }
    }
    
    // 启动同步监控
    startSyncMonitoring() {
        if (this.syncMonitorInterval) {
            clearInterval(this.syncMonitorInterval);
        }
        
        this.syncMonitorInterval = setInterval(() => {
            this.checkAndCorrectSync();
        }, 200); // 每200ms检查一次同步
    }
    
    // 停止同步监控
    stopSyncMonitoring() {
        if (this.syncMonitorInterval) {
            clearInterval(this.syncMonitorInterval);
            this.syncMonitorInterval = null;
        }
    }
    
    // 清理所有资源
    cleanupResources() {
        // 停止同步监控
        this.stopSyncMonitoring();
        
        // 停止内存监控
        this.stopMemoryMonitoring();
        
        // 清理视频元素 - 只清理DOM元素，不清空数组引用
        if (this.videoElements && this.videoElements.length > 0) {
            this.videoElements.forEach(video => {
                try {
                    video.pause();
                    video.src = '';
                    video.load();
                } catch (e) {
                    console.warn('清理视频元素时出错:', e);
                }
            });
            // 不清空数组，只清理DOM引用
            this.videoElements = [];
        }
        
        // 清理当前视频元素
        if (this.currentVideoElement) {
            try {
                this.currentVideoElement.pause();
                this.currentVideoElement.src = '';
                this.currentVideoElement.load();
            } catch (e) {
                console.warn('清理当前视频元素时出错:', e);
            }
            this.currentVideoElement = null;
        }
        
        // 清空视频播放器容器的内容
        if (this.videoPlayer) {
            this.videoPlayer.innerHTML = '';
        }
        
        console.log('🧹 所有资源已清理');
    }
    
    // 检查并修正同步
    checkAndCorrectSync() {
        if (!this.videoElements || this.videoElements.length <= 1) return;
        if (this.isSyncing) return;
        
        // 使用第一个视频作为主控制
        const masterVideo = this.videoElements[0];
        if (!masterVideo || masterVideo.paused || !masterVideo.readyState >= 2) return;
        
        const masterTime = masterVideo.currentTime;
        let needsCorrection = false;
        
        // 检查是否有视频不同步
        for (let video of this.videoElements) {
            if (video !== masterVideo && video.readyState >= 2) {
                const timeDiff = Math.abs(video.currentTime - masterTime);
                if (timeDiff > this.syncThreshold) {
                    needsCorrection = true;
                    break;
                }
            }
        }
        
        // 如果需要修正，进行同步
        if (needsCorrection) {
            this.isSyncing = true;
            
            this.videoElements.forEach(video => {
                if (video !== masterVideo && video.readyState >= 2) {
                    const timeDiff = Math.abs(video.currentTime - masterTime);
                    if (timeDiff > this.syncThreshold) {
                        video.currentTime = masterTime;
                        console.log(`🔄 修正视频同步，时间差: ${timeDiff.toFixed(3)}s`);
                    }
                }
            });
            
            setTimeout(() => {
                this.isSyncing = false;
            }, 50);
        }
    }
    
    updateTimeDisplay(startTime, endTime) {
        // 更新时间输入框
        if (this.startTimeInput) {
            this.startTimeInput.value = this.formatTime(startTime);
        }
        if (this.endTimeInput) {
            this.endTimeInput.value = this.formatTime(endTime);
        }
    }
    
    // 重置时间轴进度条
    resetTimelineProgress() {
        const progressElement = document.getElementById('timelineProgress');
        if (progressElement) {
            progressElement.style.width = '0%';
            progressElement.style.left = '0%';
        }
    }
    
    updateTimelineProgress() {
        // 获取当前播放时间（支持多视频）
        let currentTime = 0;
        let duration = 0;
        
        if (this.videoElements && this.videoElements.length > 0) {
            // 多视频情况：使用第一个视频作为主控制
            const masterVideo = this.videoElements[0];
            if (masterVideo && !isNaN(masterVideo.duration)) {
                currentTime = masterVideo.currentTime;
                duration = masterVideo.duration;
            }
        } else if (this.currentVideoElement) {
            // 单视频情况
            currentTime = this.currentVideoElement.currentTime;
            duration = this.currentVideoElement.duration;
        }
        
        if (!duration) return;
        
        // 始终使用时间轴当前选择的时间（实时设置）
        let startTime = this.parseTimeString(this.startTimeInput.value) || 0;
        let endTime = this.parseTimeString(this.endTimeInput.value) || 10;
        
        const progressElement = document.getElementById('timelineProgress');
        if (progressElement) {
            if (currentTime >= startTime && currentTime <= endTime) {
                // 计算在选择区间内的进度
                const segmentProgress = (currentTime - startTime) / (endTime - startTime);
                const startPercent = (startTime / duration) * 100;
                const endPercent = (endTime / duration) * 100;
                const segmentWidth = endPercent - startPercent;
                
                // 设置进度条位置和宽度
                progressElement.style.left = startPercent + '%';
                progressElement.style.width = (segmentWidth * segmentProgress) + '%';
            } else {
                // 如果播放位置不在选择区间内，隐藏进度条
                progressElement.style.width = '0%';
            }
        }
    }
    
    playSegment() {
        if (!this.currentVideoElement) return;
        
        // 始终使用时间轴当前选择的时间（实时设置）
        let startTime = this.parseTimeString(this.startTimeInput.value) || 0;
        let endTime = this.parseTimeString(this.endTimeInput.value) || 10;
        
        // 验证时间有效性
        if (startTime >= endTime) {
            alert('开始时间必须小于结束时间');
            return;
        }
        
        console.log(`🎬 播放片段: ${startTime}s - ${endTime}s`);
        
        // 设置所有视频的开始时间
        if (this.videoElements && this.videoElements.length > 0) {
            // 多视频同步播放优化
            this.playSegmentMultipleVideos(startTime, endTime);
        } else {
            // 单视频情况
            this.currentVideoElement.currentTime = startTime;
            this.currentVideoElement.play().catch(e => {
                console.error('❌ 单视频播放失败:', e);
                alert('播放失败: ' + e.message);
            });
        }
        
        // 设置播放结束监听器
        this.setupEndTimeCheck(endTime);
    }
    
    // 多视频片段播放优化
    playSegmentMultipleVideos(startTime, endTime) {
        console.log('🎬 多视频同步播放片段');
        
        // 暂停所有视频，设置时间，然后同步播放
        this.isSyncing = true;
        
        // 检查所有视频的就绪状态
        const readyVideos = this.videoElements.filter(video => 
            video.readyState >= 2 && !isNaN(video.duration)
        );
        
        if (readyVideos.length !== this.videoElements.length) {
            console.warn('⚠️ 部分视频未准备好，等待中...');
            setTimeout(() => this.playSegmentMultipleVideos(startTime, endTime), 200);
            return;
        }
        
        console.log(`✅ ${readyVideos.length}个视频准备就绪，开始同步播放`);
        
        const promises = readyVideos.map(async (video, index) => {
            video.pause();
            video.currentTime = startTime;
            
            // 等待视频跳转完成，增加容错性
            return new Promise(resolve => {
                const checkTime = () => {
                    if (Math.abs(video.currentTime - startTime) < 0.1) { // 增加容错范围
                        console.log(`✅ 视频${index + 1}时间设置完成: ${video.currentTime.toFixed(2)}s`);
                        resolve();
                    } else {
                        setTimeout(checkTime, 20); // 增加检查间隔
                    }
                };
                checkTime();
            });
        });
        
        // 等待所有视频跳转完成后同步播放
        Promise.all(promises).then(() => {
            console.log('🎉 所有视频时间设置完成，开始同步播放');
            
            // 分批播放，避免同时播放导致的性能问题
            readyVideos.forEach((video, index) => {
                setTimeout(() => {
                    video.play().then(() => {
                        console.log(`✅ 视频${index + 1}开始播放`);
                        // 标记用户主动播放状态
                        video.dataset.userPlayed = 'true';
                    }).catch(e => {
                        console.warn(`⚠️ 视频${index + 1}播放失败:`, e);
                    });
                }, index * 50); // 50ms间隔播放
            });
            
            this.isSyncing = false;
        }).catch(error => {
            console.error('❌ 多视频同步播放失败:', error);
            this.isSyncing = false;
        });
    }
    
    // 设置播放结束监听器
    setupEndTimeCheck(endTime) {
        if (this.videoElements && this.videoElements.length > 0) {
            // 多视频：为所有视频添加结束时间检查
            this.videoElements.forEach(video => {
                this.addEndTimeCheckToVideo(video, endTime);
            });
        } else {
            // 单视频
            this.addEndTimeCheckToVideo(this.currentVideoElement, endTime);
        }
    }
    
    // 为单个视频添加结束时间检查
    addEndTimeCheckToVideo(video, endTime) {
        const checkEndTime = () => {
            if (video.currentTime >= endTime) {
                video.pause();
                console.log('⏹️ 视频片段播放结束');
            } else {
                requestAnimationFrame(checkEndTime);
            }
        };
        
        checkEndTime();
    }
    
    pauseVideo() {
        if (this.videoElements && this.videoElements.length > 0) {
            // 暂停所有视频
            this.videoElements.forEach(video => {
                video.pause();
            });
        } else if (this.currentVideoElement) {
            this.currentVideoElement.pause();
        }
    }
    
    // 从当前位置继续播放（不跳转）
    resumeVideo() {
        if (!this.currentVideoElement) return;
        
        // 获取当前时间轴设置的结束时间
        let endTime = this.parseTimeString(this.endTimeInput.value) || 10;
        
        console.log('▶️ 从当前位置继续播放');
        
        // 如果多视频，同步播放所有视频
        if (this.videoElements && this.videoElements.length > 0) {
            this.resumeMultipleVideos(endTime);
        } else {
            this.currentVideoElement.play().catch(e => {
                console.error('❌ 单视频播放失败:', e);
            });
        }
        
        // 设置播放结束监听器
        this.setupEndTimeCheck(endTime);
    }
    
    // 多视频继续播放优化
    resumeMultipleVideos(endTime) {
        console.log('🎬 多视频继续播放');
        
        // 检查所有视频的就绪状态
        const readyVideos = this.videoElements.filter(video => 
            video.readyState >= 2 && !isNaN(video.duration)
        );
        
        if (readyVideos.length !== this.videoElements.length) {
            console.warn('⚠️ 部分视频未准备好，等待中...');
            setTimeout(() => this.resumeMultipleVideos(endTime), 200);
            return;
        }
        
        // 分批播放，避免同时播放导致的性能问题
        readyVideos.forEach((video, index) => {
            setTimeout(() => {
                video.play().then(() => {
                    console.log(`✅ 视频${index + 1}继续播放`);
                }).catch(e => {
                    console.warn(`⚠️ 视频${index + 1}播放失败:`, e);
                });
            }, index * 30); // 30ms间隔播放
        });
    }
    
    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
    
    // 时间轴拖动功能
    setupTimelineDrag() {
        let isDragging = false;
        let currentMarker = null;
        let startX = 0;
        let startLeft = 0;
        
        const timeline = document.querySelector('.timeline');
        const startMarker = this.startMarker;
        const endMarker = this.endMarker;
        
        // 开始拖动
        const startDrag = (e, marker) => {
            isDragging = true;
            currentMarker = marker;
            startX = e.clientX;
            startLeft = parseFloat(marker.style.left) || 0;
            
            // 添加拖动状态样式
            marker.classList.add('dragging');
            
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        };
        
        // 拖动中
        const onDrag = (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const timelineRect = timeline.getBoundingClientRect();
            let newLeft = startLeft + (deltaX / timelineRect.width) * 100;
            
            // 边界控制 - 减少最小间距限制，允许更小的区间
            if (currentMarker === startMarker) {
                // 开始标记不能超过结束标记，且不能小于0
                const endLeft = parseFloat(endMarker.style.left) || 100;
                newLeft = Math.max(0, Math.min(endLeft - 0.5, newLeft)); // 从2%减少到0.5%
            } else if (currentMarker === endMarker) {
                // 结束标记不能小于开始标记，且不能超过100
                const startLeft = parseFloat(startMarker.style.left) || 0;
                newLeft = Math.max(startLeft + 0.5, Math.min(100, newLeft)); // 从2%减少到0.5%
            }
            
            currentMarker.style.left = newLeft + '%';
            
            // 更新对应的时间输入框和选择区间
            if (currentMarker === startMarker) {
                this.updateStartTimeFromMarker(newLeft);
            } else if (currentMarker === endMarker) {
                this.updateEndTimeFromMarker(newLeft);
            }
        };
        
        // 停止拖动
        const stopDrag = () => {
            if (isDragging && currentMarker) {
                currentMarker.classList.remove('dragging');
            }
            
            isDragging = false;
            currentMarker = null;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
        
        // 绑定拖动事件
        startMarker.addEventListener('mousedown', (e) => startDrag(e, startMarker));
        endMarker.addEventListener('mousedown', (e) => startDrag(e, endMarker));
        
        // 添加触摸支持
        startMarker.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startDrag(touch, startMarker);
        });
        
        endMarker.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startDrag(touch, endMarker);
        });
    }
    

    
    // 从输入框设置开始时间（用于修改片段数据）
    setStartTimeFromInput() {
        const timeStr = this.startTimeInput.value;
        const seconds = this.parseTimeString(timeStr);
        if (seconds !== null) {
            this.updateStartTime(seconds);
        } else {
            alert('请输入正确的时间格式 (MM:SS)');
        }
    }
    
    // 从输入框设置结束时间（用于修改片段数据）
    setEndTimeFromInput() {
        const timeStr = this.endTimeInput.value;
        const seconds = this.parseTimeString(timeStr);
        if (seconds !== null) {
            this.updateEndTime(seconds);
        } else {
            alert('请输入正确的时间格式 (MM:SS)');
        }
    }
    
    // 解析时间字符串 (MM:SS) 为秒数，支持不完整输入
    parseTimeString(timeStr) {
        // 处理完整格式 MM:SS
        const fullMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (fullMatch) {
            const minutes = parseInt(fullMatch[1]);
            const seconds = parseInt(fullMatch[2]);
            if (seconds < 60) {
                return minutes * 60 + seconds;
            }
        }
        
        // 处理不完整格式，如 "1:", "12:", "12:3" 等
        const partialMatch = timeStr.match(/^(\d{1,2}):?(\d{0,2})$/);
        if (partialMatch) {
            const minutes = parseInt(partialMatch[1]);
            const seconds = partialMatch[2] ? parseInt(partialMatch[2]) : 0;
            
            // 验证分钟和秒数的合理性
            if (minutes >= 0 && minutes <= 99 && seconds >= 0 && seconds < 60) {
                return minutes * 60 + seconds;
            }
        }
        
        // 处理纯数字输入，如 "123" (表示123秒)
        const numberMatch = timeStr.match(/^(\d+)$/);
        if (numberMatch) {
            const totalSeconds = parseInt(numberMatch[1]);
            if (totalSeconds >= 0 && totalSeconds <= 9999) { // 限制最大9999秒
                return totalSeconds;
            }
        }
        
        return null;
    }
    
    // 更新开始时间
    updateStartTime(seconds) {
        if (this.currentSegment) {
            this.currentSegment.start_time = seconds;
            this.updateTimeDisplay(seconds, this.currentSegment.end_time);
            this.updateTimelineMarkers();
        }
    }
    
    // 更新结束时间
    updateEndTime(seconds) {
        if (this.currentSegment) {
            this.currentSegment.end_time = seconds;
            this.updateTimeDisplay(this.currentSegment.start_time, seconds);
            this.updateTimelineMarkers();
        }
    }
    
    // 从标记位置更新开始时间
    updateStartTimeFromMarker(percentage) {
        if (this.currentVideoElement) {
            const duration = this.currentVideoElement.duration;
            const newTime = (percentage / 100) * duration;
            const endTime = this.parseTimeString(this.endTimeInput.value) || 10;
            
            // 确保开始时间不大于结束时间
            if (newTime >= endTime) {
                return;
            }
            
            // 使用统一的同步方法
            this.syncTimelineElements(newTime, endTime);
            
            // 设置所有视频的播放时间
            if (this.videoElements && this.videoElements.length > 0) {
                this.videoElements.forEach(video => {
                    if (!isNaN(video.duration)) {
                        video.currentTime = newTime;
                    }
                });
            } else {
                this.currentVideoElement.currentTime = newTime;
            }
        }
    }
    
    // 从标记位置更新结束时间
    updateEndTimeFromMarker(percentage) {
        if (this.currentVideoElement) {
            const duration = this.currentVideoElement.duration;
            const newTime = (percentage / 100) * duration;
            const startTime = this.parseTimeString(this.startTimeInput.value) || 0;
            
            // 确保结束时间不小于开始时间
            if (newTime <= startTime) {
                return;
            }
            
            // 使用统一的同步方法
            this.syncTimelineElements(startTime, newTime);
        }
    }
    
    // 隐藏视频播放区域和时间轴
    hideVideoPlayer() {
        if (this.videoPlayer) {
            this.videoPlayer.innerHTML = '';
            this.videoPlayer.style.display = 'none';
        }
        
        // 隐藏时间轴相关元素
        const timelineContainer = document.querySelector('.timeline-container');
        if (timelineContainer) {
            timelineContainer.style.display = 'none';
        }
        
        console.log('🚫 视频播放区域和时间轴已隐藏');
    }
    
    // 显示视频播放区域和时间轴
    showVideoPlayer() {
        if (this.videoPlayer) {
            this.videoPlayer.style.display = 'block';
        }
        
        // 显示时间轴相关元素
        const timelineContainer = document.querySelector('.timeline-container');
        if (timelineContainer) {
            timelineContainer.style.display = 'block';
        }
        
        console.log('✅ 视频播放区域和时间轴已显示');
    }
    
    // 强制同步所有时间相关元素
    syncTimelineElements(startTime, endTime, updateInputs = true) {
        console.log(`🔄 强制同步时间轴元素: 开始=${this.formatTime(startTime)}, 结束=${this.formatTime(endTime)}, 更新输入框=${updateInputs}`);
        
        // 确保时间值有效
        if (isNaN(startTime) || isNaN(endTime) || startTime < 0 || endTime < 0) {
            console.warn('⚠️ 无效的时间值，跳过同步');
            return;
        }
        
        // 如果有视频元素，获取视频时长并应用边界控制
        if (this.currentVideoElement && this.currentVideoElement.duration) {
            const duration = this.currentVideoElement.duration;
            
            // 边界控制：确保时间不超过视频时长
            startTime = Math.max(0, Math.min(startTime, duration - 1));
            endTime = Math.max(1, Math.min(endTime, duration));
            
            // 确保开始时间小于结束时间
            if (startTime >= endTime) {
                console.warn('⚠️ 开始时间不能大于或等于结束时间，自动调整');
                startTime = Math.max(0, endTime - 10);
                if (startTime < 0) startTime = 0;
            }
            
            // 计算百分比
            const startPercent = (startTime / duration) * 100;
            const endPercent = (endTime / duration) * 100;
            
            // 百分比边界控制
            const clampedStartPercent = Math.max(0, Math.min(98, startPercent));
            const clampedEndPercent = Math.max(2, Math.min(100, endPercent));
            
            // 确保结束百分比大于开始百分比
            const finalStartPercent = Math.min(clampedStartPercent, clampedEndPercent - 2);
            const finalEndPercent = Math.max(clampedEndPercent, finalStartPercent + 2);
            
            // 更新时间轴标记位置
            if (this.startMarker) this.startMarker.style.left = finalStartPercent + '%';
            if (this.endMarker) this.endMarker.style.left = finalEndPercent + '%';
            
            // 更新选择区间
            this.updateTimelineSelection(finalStartPercent, finalEndPercent);
            
            console.log(`📊 百分比计算: 开始=${finalStartPercent.toFixed(1)}%, 结束=${finalEndPercent.toFixed(1)}%`);
            console.log(`⏱️ 时间边界控制: 视频时长=${this.formatTime(duration)}, 调整后开始=${this.formatTime(startTime)}, 结束=${this.formatTime(endTime)}`);
        } else {
            // 没有视频元素时，使用固定百分比
            const startPercent = 0;
            const endPercent = 10;
            
            // 更新时间轴标记位置
            if (this.startMarker) this.startMarker.style.left = startPercent + '%';
            if (this.endMarker) this.endMarker.style.left = endPercent + '%';
            
            // 更新选择区间
            this.updateTimelineSelection(startPercent, endPercent);
            
            console.log(`📊 使用固定百分比: 开始=${startPercent}%, 结束=${endPercent}%`);
        }
        
        // 更新时间标记上的时间显示
        const startMarkerTime = document.getElementById('startMarkerTime');
        const endMarkerTime = document.getElementById('endMarkerTime');
        if (startMarkerTime) startMarkerTime.textContent = this.formatTime(startTime);
        if (endMarkerTime) endMarkerTime.textContent = this.formatTime(endTime);
        
        // 只在需要时更新时间输入框
        if (updateInputs) {
            if (this.startTimeInput) this.startTimeInput.value = this.formatTime(startTime);
            if (this.endTimeInput) this.endTimeInput.value = this.formatTime(endTime);
        }
        
        console.log('✅ 时间轴元素同步完成');
    }
    
    // 更新时间轴标记位置
    updateTimelineMarkers() {
        if (this.currentSegment && this.currentVideoElement) {
            const duration = this.currentVideoElement.duration;
            
            // 边界控制：确保片段时间不超过视频时长
            let startTime = Math.max(0, Math.min(this.currentSegment.start_time, duration - 1));
            let endTime = Math.max(1, Math.min(this.currentSegment.end_time, duration));
            
            // 确保开始时间小于结束时间
            if (startTime >= endTime) {
                console.warn('⚠️ 片段时间无效，自动调整');
                startTime = Math.max(0, endTime - 10);
                if (startTime < 0) startTime = 0;
            }
            
            let startPercent = (startTime / duration) * 100;
            let endPercent = (endTime / duration) * 100;
            
            // 确保结束标记永远在开始标记右边
            if (startPercent > endPercent) {
                [startPercent, endPercent] = [endPercent, startPercent];
            }
            
            // 百分比边界控制
            startPercent = Math.max(0, Math.min(98, startPercent));
            endPercent = Math.max(2, Math.min(100, endPercent));
            
            this.startMarker.style.left = startPercent + '%';
            this.endMarker.style.left = endPercent + '%';
            
            // 更新时间选择区间
            this.updateTimelineSelection(startPercent, endPercent);
            
            // 更新时间标记上的时间显示
            const startMarkerTime = document.getElementById('startMarkerTime');
            const endMarkerTime = document.getElementById('endMarkerTime');
            
            if (startMarkerTime) {
                startMarkerTime.textContent = this.formatTime(startTime);
            }
            if (endMarkerTime) {
                endMarkerTime.textContent = this.formatTime(endTime);
            }
            
            console.log(`⏱️ 片段时间轴更新: 视频时长=${this.formatTime(duration)}, 调整后开始=${this.formatTime(startTime)}, 结束=${this.formatTime(endTime)}`);
        }
    }
    
    // 根据时间值更新时间轴标记位置（不依赖片段数据）
    updateTimelineMarkersFromTime(startTime, endTime) {
        if (this.currentVideoElement && this.startMarker && this.endMarker) {
            const duration = this.currentVideoElement.duration;
            if (duration && duration > 0) {
                // 将时间转换为百分比
                let startPercent = (startTime / duration) * 100;
                let endPercent = (endTime / duration) * 100;
                
                // 确保结束标记永远在开始标记右边
                if (startPercent > endPercent) {
                    [startPercent, endPercent] = [endPercent, startPercent];
                }
                
                // 边界控制
                startPercent = Math.max(0, Math.min(98, startPercent));
                endPercent = Math.max(2, Math.min(100, endPercent));
                
                // 更新时间轴标记位置
                this.startMarker.style.left = startPercent + '%';
                this.endMarker.style.left = endPercent + '%';
                
                // 更新选择区间
                this.updateTimelineSelection(startPercent, endPercent);
                
                // 更新时间标记上的时间显示
                const startMarkerTime = document.getElementById('startMarkerTime');
                const endMarkerTime = document.getElementById('endMarkerTime');
                if (startMarkerTime) startMarkerTime.textContent = this.formatTime(startTime);
                if (endMarkerTime) endMarkerTime.textContent = this.formatTime(endTime);
                
                console.log(`🎯 时间轴标记已更新: 开始=${startTime}(${startPercent.toFixed(1)}%), 结束=${endTime}(${endPercent.toFixed(1)}%)`);
            }
        }
    }
    
    // 更新时间轴选择区间
    updateTimelineSelection(startPercent, endPercent) {
        const selection = document.getElementById('timelineSelection');
        if (selection) {
            // 确保参数是有效的数字
            if (isNaN(startPercent) || isNaN(endPercent)) {
                console.warn('⚠️ updateTimelineSelection: 无效的百分比值', startPercent, endPercent);
                return;
            }
            
            const left = Math.min(startPercent, endPercent);
            const right = Math.max(startPercent, endPercent);
            
            // 边界控制，确保不超出时间轴范围
            const clampedLeft = Math.max(0, Math.min(98, left));
            const clampedRight = Math.max(2, Math.min(100, right));
            
            // 计算宽度，确保最小宽度
            const width = Math.max(1, clampedRight - clampedLeft);
            
            selection.style.left = clampedLeft + '%';
            selection.style.width = width + '%';
            
            console.log(`🎯 时间轴选择区间更新: 左=${clampedLeft.toFixed(1)}%, 右=${clampedRight.toFixed(1)}%, 宽度=${width.toFixed(1)}%`);
        }
    }
    
    // 更新播放时间轴标记（不影响存储数据）
    updateTimelineMarkersForPlayback(startTime, endTime) {
        if (this.currentVideoElement && this.startMarker && this.endMarker) {
            const duration = this.currentVideoElement.duration;
            if (duration && duration > 0) {
                const startPercent = (startTime / duration) * 100;
                const endPercent = (endTime / duration) * 100;
                
                // 边界控制
                const clampedStartPercent = Math.max(0, Math.min(98, startPercent));
                const clampedEndPercent = Math.max(2, Math.min(100, endPercent));
                
                // 更新时间轴标记位置
                this.startMarker.style.left = clampedStartPercent + '%';
                this.endMarker.style.left = clampedEndPercent + '%';
                
                // 更新选择区间
                this.updateTimelineSelection(clampedStartPercent, clampedEndPercent);
                
                // 更新时间标记上的时间显示
                const startMarkerTime = document.getElementById('startMarkerTime');
                const endMarkerTime = document.getElementById('endMarkerTime');
                if (startMarkerTime) startMarkerTime.textContent = this.formatTime(startTime);
                if (endMarkerTime) endMarkerTime.textContent = this.formatTime(endTime);
            }
        }
    }
    
    // 初始化默认时间轴状态
    initializeDefaultTimeline() {
        // console.log('🔄 开始初始化默认时间轴状态...');
        
        // 检查必要的DOM元素是否存在
        if (!this.startMarker || !this.endMarker) {
            console.warn('⚠️ 时间轴标记元素不存在，跳过初始化');
            return;
        }
        
        // 重置进度条状态
        this.resetTimelineProgress();
        
        // 设置默认时间值（秒）
        const defaultStartTime = 0;
        const defaultEndTime = 10;
        
        // 设置默认位置：开始0%，结束10%
        this.startMarker.style.left = '0%';
        this.endMarker.style.left = '10%';
        
        // 更新选择区间
        this.updateTimelineSelection(0, 10);
        
        // 更新时间显示
        const startMarkerTime = document.getElementById('startMarkerTime');
        const endMarkerTime = document.getElementById('endMarkerTime');
        if (startMarkerTime) startMarkerTime.textContent = this.formatTime(defaultStartTime);
        if (endMarkerTime) endMarkerTime.textContent = this.formatTime(defaultEndTime);
        
        // 更新时间输入框
        if (this.startTimeInput) this.startTimeInput.value = this.formatTime(defaultStartTime);
        if (this.endTimeInput) this.endTimeInput.value = this.formatTime(defaultEndTime);
        
        // 强制同步所有时间相关元素
        this.syncTimelineElements(defaultStartTime, defaultEndTime);
        
        // console.log(`✅ 默认时间轴状态初始化完成: 开始=${this.formatTime(defaultStartTime)}, 结束=${this.formatTime(defaultEndTime)}`);
    }
    
    // ==================== 统计功能 ====================
    
    /**
     * 显示统计信息弹窗
     */
    async showStatistics() {
        try {
            // 获取统计数据
            await this.fetchStatistics();
            
            // 显示统计弹窗
            const modal = document.getElementById('statisticsModal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                console.error('统计弹窗元素未找到');
                alert('统计弹窗元素未找到');
            }
            
        } catch (error) {
            console.error('获取统计数据失败:', error);
            alert('获取统计数据失败，请重试');
        }
    }
    
    /**
     * 关闭统计信息弹窗
     */
    closeStatistics() {
        document.getElementById('statisticsModal').style.display = 'none';
    }
    
    /**
     * 获取统计数据
     */
    async fetchStatistics() {
        try {
            // 获取当前标注者
            const currentAnnotator = this.currentAnnotator || 'all';
            
            // 获取所有数据集的统计信息
            const response = await fetch(`/api/statistics?annotator=${currentAnnotator}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.statisticsData = await response.json();
            this.updateStatisticsDisplay();
            
        } catch (error) {
            console.error('获取统计数据失败:', error);
            throw error;
        }
    }
    
    /**
     * 更新统计显示
     */
    updateStatisticsDisplay() {
        if (!this.statisticsData) {
            return;
        }
        
        // 更新数据集统计
        this.updateDatasetStats();
        
        // 更新片段长度+状态统计
        this.updateSegmentLengthStatusStats();
    }
    
    /**
     * 更新数据集统计
     */
    updateDatasetStats() {
        const datasetStatsContainer = document.getElementById('datasetStats');
        if (!datasetStatsContainer || !this.statisticsData.datasets) return;
        
        let html = '';
        for (const [datasetName, stats] of Object.entries(this.statisticsData.datasets)) {
            html += `
                <div class="dataset-stat-item">
                    <h4>${datasetName}</h4>
                    <div class="dataset-stat-row">
                        <span class="dataset-stat-label">已审阅:</span>
                        <span class="dataset-stat-value">${stats.reviewed}</span>
                    </div>
                    <div class="dataset-stat-row">
                        <span class="dataset-stat-label">未审阅:</span>
                        <span class="dataset-stat-value">${stats.unreviewed}</span>
                    </div>
                    <div class="dataset-stat-row">
                        <span class="dataset-stat-label">异常:</span>
                        <span class="dataset-stat-value">${stats.exception}</span>
                    </div>
                </div>
            `;
        }
        
        datasetStatsContainer.innerHTML = html;
    }
    
    /**
     * 更新片段长度+状态统计
     */
    updateSegmentLengthStatusStats() {
        if (!this.statisticsData.segments || !this.statisticsData.segments.lengthStatus) return;
        
        const lengthStats = this.statisticsData.segments.lengthStatus;
        
        // 更新小片段统计
        document.getElementById('shortSelected').textContent = lengthStats.short.selected || 0;
        document.getElementById('shortPending').textContent = lengthStats.short.pending || 0;
        document.getElementById('shortRejected').textContent = lengthStats.short.rejected || 0;
        
        // 更新中片段统计
        document.getElementById('mediumSelected').textContent = lengthStats.medium.selected || 0;
        document.getElementById('mediumPending').textContent = lengthStats.medium.pending || 0;
        document.getElementById('mediumRejected').textContent = lengthStats.medium.rejected || 0;
        
        // 更新长片段统计
        document.getElementById('longSelected').textContent = lengthStats.long.selected || 0;
        document.getElementById('longPending').textContent = lengthStats.long.pending || 0;
        document.getElementById('longRejected').textContent = lengthStats.long.rejected || 0;
        
        // 更新超长片段统计
        document.getElementById('extraLongSelected').textContent = lengthStats.extraLong.selected || 0;
        document.getElementById('extraLongPending').textContent = lengthStats.extraLong.pending || 0;
        document.getElementById('extraLongRejected').textContent = lengthStats.extraLong.rejected || 0;
        
        // 更新所有长度片段统计
        document.getElementById('allSelected').textContent = lengthStats.all.selected || 0;
        document.getElementById('allPending').textContent = lengthStats.all.pending || 0;
        document.getElementById('allRejected').textContent = lengthStats.all.rejected || 0;
    }
    
    /**
     * 刷新片段列表排序
     */
    async refreshSegmentOrder() {
        try {
            console.log('🔄 开始刷新片段列表排序...');
            
            if (this.currentDataset) {
                // 重新加载数据集片段（会按状态排序）
                await this.loadSegments(this.currentDataset);
            }
            
            if (this.currentSample) {
                // 重新加载样本片段（会按状态排序）
                await this.loadSampleSegments(this.currentSample.id);
            }
            
            console.log('✅ 片段列表排序已刷新');
            
        } catch (error) {
            console.error('刷新片段列表排序失败:', error);
        }
    }
    

}

// 全局函数，供HTML中的onclick调用
window.app = null;

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoAnnotationApp();
});
