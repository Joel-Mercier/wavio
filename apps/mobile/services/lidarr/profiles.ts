import { lidarrRequest } from "@/services/lidarr";
import type {
  LidarrMetadataProfile,
  LidarrQualityProfile,
  LidarrRootFolder,
} from "@/services/lidarr/types";

export async function getQualityProfiles(): Promise<LidarrQualityProfile[]> {
  return lidarrRequest<LidarrQualityProfile[]>("/qualityprofile");
}

export async function getMetadataProfiles(): Promise<LidarrMetadataProfile[]> {
  return lidarrRequest<LidarrMetadataProfile[]>("/metadataprofile");
}

export async function getRootFolders(): Promise<LidarrRootFolder[]> {
  return lidarrRequest<LidarrRootFolder[]>("/rootfolder");
}
