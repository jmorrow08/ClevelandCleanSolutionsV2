import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { formatDate } from '../../lib/utils';
import { ArrowLeft, MapPin, Clock, Camera, CheckCircle2, Circle } from 'lucide-react';

interface JobDetailsPageProps {
  jobId: string;
  onBack: () => void;
}

export const JobDetailsPage: React.FC<JobDetailsPageProps> = ({ jobId, onBack }) => {
  const { getJobById, toggleTask, addJobPhoto, updateJob } = useApp();
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  
  const job = getJobById(jobId);
  
  if (!job) {
    return (
      <div className="space-y-8">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Jobs
        </Button>
        <div>Job not found</div>
      </div>
    );
  }

  const handleTaskToggle = (taskId: string) => {
    toggleTask(jobId, taskId);
    
    // Check if all tasks are completed and update job status
    const updatedJob = { ...job };
    const taskIndex = updatedJob.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      updatedJob.tasks[taskIndex].completed = !updatedJob.tasks[taskIndex].completed;
      
      const allCompleted = updatedJob.tasks.every(task => task.completed);
      if (allCompleted && job.status !== 'completed') {
        updateJob(jobId, { status: 'completed' });
      } else if (!allCompleted && job.status === 'completed') {
        updateJob(jobId, { status: 'in-progress' });
      }
    }
  };

  const handlePhotoUpload = () => {
    // Simulate photo upload with a stock image
    const stockImages = [
      'https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/4099123/pexels-photo-4099123.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg?auto=compress&cs=tinysrgb&w=800'
    ];
    
    const randomImage = stockImages[Math.floor(Math.random() * stockImages.length)];
    
    addJobPhoto(jobId, {
      url: randomImage,
      caption: 'Job completion photo',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Maria Rodriguez'
    });
    
    setShowPhotoUpload(false);
  };

  const completedTasks = job.tasks.filter(task => task.completed).length;
  const progressPercentage = (completedTasks / job.tasks.length) * 100;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Jobs
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{job.clientName}</h1>
          <p className="text-muted-foreground">Job details and progress</p>
        </div>
      </div>

      {/* Job Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Job Information</CardTitle>
            <Badge variant={job.status === 'completed' ? 'success' : job.status === 'in-progress' ? 'warning' : 'default'}>
              {job.status.replace('-', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{job.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(job.scheduledDate)}</span>
            </div>
          </div>
          {job.notes && (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Special Instructions:</h4>
              <p className="text-muted-foreground">{job.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Tasks Completed</span>
              <span>{completedTasks}/{job.tasks.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {progressPercentage === 100 ? 'Job Complete!' : `${Math.round(progressPercentage)}% Complete`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Task Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {job.tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  task.completed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => handleTaskToggle(task.id)}
              >
                {task.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                )}
                <span className={`${task.completed ? 'line-through text-green-800' : ''}`}>
                  {task.description}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photo Upload */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Job Photos</CardTitle>
            <Button onClick={() => setShowPhotoUpload(true)}>
              <Camera className="h-4 w-4 mr-2" />
              Upload Photo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {job.photos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {job.photos.map((photo) => (
                <div key={photo.id} className="border rounded-lg overflow-hidden">
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Job photo'}
                    className="w-full h-32 object-cover"
                  />
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground">
                      {photo.caption || 'No caption'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No photos uploaded yet</p>
          )}
        </CardContent>
      </Card>

      {/* Photo Upload Modal */}
      {showPhotoUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Upload Job Photo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Take a photo to document the completed work at this location.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handlePhotoUpload}>
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button variant="outline" onClick={() => setShowPhotoUpload(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};