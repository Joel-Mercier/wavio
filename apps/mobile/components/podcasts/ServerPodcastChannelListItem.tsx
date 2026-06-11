import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { cn } from "@/utils/tailwind";

interface ServerPodcastChannelListItemProps {
	channel: PodcastChannel;
	index: number;
	layout?: "vertical" | "horizontal";
	className?: string;
}

export function channelImageUrl(channel: PodcastChannel): string | undefined {
	return (
		channel.originalImageUrl ||
		(channel.coverArt ? artworkUrl(channel.coverArt) : undefined)
	);
}

export default function ServerPodcastChannelListItem({
	channel,
	index,
	layout = "vertical",
	className = "",
}: ServerPodcastChannelListItemProps) {
	const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
	const image = channelImageUrl(channel);
	return (
		<FadeOutScaleDown
			href={{
				pathname: "/podcast-channels/[id]",
				params: {
					id: channel.id,
					title: channel.title,
					imageUrl: image,
					coverArt: channel.coverArt,
					url: channel.url,
					description: channel.description,
				},
			}}
			className={cn(className, {
				"mt-6": layout === "vertical" && index === 0,
				"pt-4": layout === "vertical" && index !== 0,
				"px-6": layout === "vertical",
				"mr-6": layout === "horizontal",
			})}
		>
			<VStack
				className={cn("transition duration-100 gap-y-2", {
					"w-32": layout === "horizontal",
					"flex-row items-center": layout === "vertical",
				})}
			>
				{image ? (
					<Image
						source={{ uri: image }}
						className={cn("w-32 h-32 rounded-md aspect-square", {
							"w-16 h-16": layout === "vertical",
						})}
						alt={channel.title}
					/>
				) : (
					<Box
						className={cn(
							"w-32 h-32 rounded-md bg-primary-600 items-center justify-center",
							{ "w-16 h-16": layout === "vertical" },
						)}
					>
						<Podcast size={layout === "vertical" ? 24 : 48} color={white} />
					</Box>
				)}
				<VStack
					className={cn({ "flex-col ml-4 flex-1": layout === "vertical" })}
				>
					<Heading
						size={layout === "horizontal" ? "sm" : "lg"}
						className="text-white"
						numberOfLines={2}
					>
						{channel.title}
					</Heading>
					{!!channel?.author && (
						<Text className="text-primary-100 text-md" numberOfLines={1}>
							{channel.author}
						</Text>
					)}
				</VStack>
			</VStack>
		</FadeOutScaleDown>
	);
}
