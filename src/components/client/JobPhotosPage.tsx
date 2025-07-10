import React from 'react';
import { useApp } from '../../contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatDate } from '../../lib/utils';
import { Camera, Download } from 'lucide-react';
import { Button } from '../ui/Button';

export const JobPhotosPage: React.FC = () => {
  const { clients, jobs } = useApp();
  
  // Simulating current client as first client
  const currentClient = clients[0];
  const clientJobs = jobs.filter(job => job.clientId === currentClient.id);
  
  const allPhotos = clientJobs.flatMap(job => 
    job.photos.map(photo => ({
      ...photo,
      jobDate: job.scheduledDate,
      jobLocation: job.location,
      employeeName: job.assignedEmployeeName
    }))
  ).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Job Photos</h1>
        <p className="text-muted-foreground">Before and after photos from your cleaning services</p>
      </div>

      {allPhotos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allPhotos.map((photo) => (
            <Card key={photo.id} className="overflow-hidden">
              <div className="aspect-video relative">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Job photo'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2">
                  <Button variant="outline" size="sm" className="bg-white/90">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="default">
                      {formatDate(photo.jobDate)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(photo.uploadedAt)}
                    </span>
                  </div>
                  {photo.caption && (
                    <p className="text-sm font-medium">{photo.caption}</p>
                  )}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Uploaded by: {photo.uploadedBy}</div>
                    <div>Location: {photo.jobLocation}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No photos available</h3>
            <p className="text-muted-foreground text-center">
              Photos from completed cleaning services will appear here. 
              Your cleaning team will upload before and after photos to document their work.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};