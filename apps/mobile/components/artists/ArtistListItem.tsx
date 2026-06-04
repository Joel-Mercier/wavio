import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useIsCachedOffline } from "@/hooks/useIsCachedOffline";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";

interface ArtistListItemProps {
	artist: ArtistID3;
}

export default function ArtistListItem({ artist }: ArtistListItemProps) {
	const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
	const isReachableOffline = useIsCachedOffline(["artist", artist.id]);
	return (
		<FadeOutScaleDown
			href={`/artists/${artist.id}`}
			disabled={!isReachableOffline}
			className="mr-6"
		>
			<VStack className="gap-y-2 w-32">
				<ImageWithFallback
					source={
						artist.coverArt ? { uri: artworkUrl(artist.coverArt) } : undefined
					}
					className="w-32 h-32 rounded-full aspect-square"
					alt="Artist cover"
					fallback={
						<Box className="w-32 h-32 rounded-full bg-primary-600 items-center justify-center aspect-square">
							<User size={48} color={white} />
						</Box>
					}
				/>
				<Heading size="sm" className="text-white" numberOfLines={1}>
					{artist.name}
				</Heading>
				<Text numberOfLines={2} className="text-md text-primary-100">
					Artist
				</Text>
			</VStack>
		</FadeOutScaleDown>
	);
}
