from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import os
from datetime import datetime
from models.dataset_manager import DatasetManager
from models.annotation_manager import AnnotationManager
from models.video_download_manager import VideoDownloadManager

app = Flask(__name__)
CORS(app)

# 初始化管理器
dataset_manager = DatasetManager()
annotation_manager = AnnotationManager()
video_download_manager = VideoDownloadManager()

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

@app.route('/video-test')
def video_test():
    """视频播放测试页面"""
    return render_template('video_test.html')

@app.route('/simple-video-test')
def simple_video_test():
    """简单视频测试页面"""
    return render_template('simple_video_test.html')

@app.route('/youtube-test')
def youtube_test():
    """YouTube视频播放测试页面"""
    return render_template('test_youtube_player.html')

@app.route('/path-debug')
def path_debug():
    """路径调试测试页面"""
    return render_template('test_path_debug.html')

@app.route('/api/annotators')
def get_annotators():
    """获取所有标注者列表"""
    return jsonify(annotation_manager.get_all_annotators())

@app.route('/api/datasets')
def get_datasets():
    """获取所有数据集列表"""
    annotator = request.args.get('annotator')
    return jsonify(dataset_manager.get_datasets_for_annotator(annotator))

@app.route('/api/dataset/<dataset_id>/samples')
def get_dataset_samples(dataset_id):
    """获取指定数据集的样本列表"""
    annotator = request.args.get('annotator')
    return jsonify(dataset_manager.get_samples_for_dataset(dataset_id, annotator))

@app.route('/api/dataset/<dataset_id>/segments')
def get_dataset_segments(dataset_id):
    """获取指定数据集的片段列表"""
    return jsonify(dataset_manager.get_segments_for_dataset(dataset_id))

@app.route('/api/sample/<sample_id>/segments')
def get_sample_segments(sample_id):
    """获取指定样本的片段列表"""
    return jsonify(dataset_manager.get_segments_for_sample(sample_id))

@app.route('/api/segment/<segment_id>/update', methods=['POST'])
def update_segment(segment_id):
    """更新片段状态和时间"""
    data = request.json
    success = dataset_manager.update_segment(segment_id, data)
    return jsonify({'success': success})

@app.route('/api/segment/create', methods=['POST'])
def create_segment():
    """创建新片段"""
    data = request.json
    segment_data = {
        'id': data.get('id'),
        'video_path': data.get('video_path'),
        'start_time': data.get('start_time'),
        'end_time': data.get('end_time'),
        'status': data.get('status', '待抉择'),
        'sample_id': data.get('sample_id')
    }
    success = dataset_manager.create_segment(segment_data)
    return jsonify({'success': success, 'segment': segment_data if success else None})

@app.route('/api/dataset/<dataset_id>/remove_rejected', methods=['POST'])
def remove_rejected_segments(dataset_id):
    """删除所有弃用的片段"""
    success = dataset_manager.remove_rejected_segments(dataset_id)
    return jsonify({'success': success})

@app.route('/api/annotator/select', methods=['POST'])
def select_annotator():
    """选择标注者身份"""
    data = request.json
    annotator = data.get('annotator')
    annotation_manager.set_current_annotator(annotator)
    return jsonify({'success': True, 'annotator': annotator})

@app.route('/api/video/status', methods=['GET'])
def get_video_status():
    """获取视频状态信息"""
    dataset_name = request.args.get('dataset')
    sample_name = request.args.get('sample')
    video_paths = request.args.getlist('video_paths[]')
    
    if not dataset_name or not sample_name or not video_paths:
        return jsonify({'error': '缺少必要参数'}), 400
    
    video_statuses = video_download_manager.get_sample_video_status(
        dataset_name, sample_name, video_paths
    )
    
    return jsonify({'video_statuses': video_statuses})

@app.route('/api/video/download', methods=['POST'])
def download_video():
    """下载视频"""
    data = request.json
    dataset_name = data.get('dataset')
    sample_name = data.get('sample')
    video_type = data.get('type')  # 'youtube', 'single_video', 'multiple_videos'
    video_info = data.get('video_info')  # 具体信息
    
    if not dataset_name or not sample_name or not video_type:
        return jsonify({'error': '缺少必要参数'}), 400
    
    try:
        if video_type == 'youtube':
            # YouTube视频下载
            youtube_url = video_info.get('youtube_url')
            video_filename = f"{sample_name}_youtube.mp4"
            
            result = video_download_manager.download_youtube_video(
                youtube_url, dataset_name, sample_name, video_filename
            )
            
        elif video_type in ['single_video', 'multiple_videos']:
            # HuggingFace视频下载
            result = video_download_manager.download_huggingface_video(
                dataset_name, sample_name
            )
            
        else:
            return jsonify({'error': '不支持的视频类型'}), 400
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'下载失败: {str(e)}'}), 500

@app.route('/api/video/delete', methods=['POST'])
def delete_video():
    """删除视频文件"""
    data = request.json
    dataset_name = data.get('dataset')
    sample_name = data.get('sample')
    video_type = data.get('type')
    
    if not dataset_name or not sample_name or not video_type:
        return jsonify({'error': '缺少必要参数'}), 400
    
    try:
        result = video_download_manager.delete_video_files(dataset_name, sample_name, video_type)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': f'删除失败: {str(e)}'}), 500

@app.route('/api/segment/<segment_id>/delete', methods=['DELETE'])
def delete_segment(segment_id):
    """删除指定片段"""
    try:
        success = dataset_manager.delete_segment(segment_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': f'删除片段失败: {str(e)}'}), 500

@app.route('/api/sample/<sample_id>/mark_reviewed', methods=['POST'])
def mark_sample_reviewed(sample_id):
    """标记样本为已审阅"""
    try:
        success = dataset_manager.mark_sample_reviewed(sample_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': f'标记样本失败: {str(e)}'}), 500

@app.route('/api/sample/<sample_id>/mark_unreviewed', methods=['POST'])
def mark_sample_unreviewed(sample_id):
    """标记样本为未审阅"""
    try:
        success = dataset_manager.mark_sample_unreviewed(sample_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': f'设置样本失败: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
