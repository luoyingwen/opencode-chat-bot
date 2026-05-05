import { fetchCurrentModel, getModelSelectionLists } from "../../model/manager.js";
import type { FavoriteModel } from "../../model/types.js";
import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

function formatModelKey(model: FavoriteModel): string {
  return `${model.providerID}/${model.modelID}`;
}

function appendModelSection(params: {
  message: string;
  title: string;
  models: FavoriteModel[];
  startIndex: number;
  currentModelKey: string;
}): { message: string; nextIndex: number } {
  if (params.models.length === 0) {
    return { message: params.message, nextIndex: params.startIndex };
  }

  let message = `${params.message}\n## ${params.title}\n\n`;
  let index = params.startIndex;

  for (const model of params.models) {
    const modelKey = formatModelKey(model);
    const marker = modelKey === params.currentModelKey ? " ✅" : "";
    message += `${index}. **${modelKey}**${marker}\n`;
    index += 1;
  }

  return { message: `${message}\n`, nextIndex: index };
}

export class ModelsCommandHandler implements CommandHandler {
  readonly command = "models";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const { favorites, recent } = await getModelSelectionLists();
      const total = favorites.length + recent.length;

      if (total === 0) {
        return {
          outputs: [
            {
              text: "No models found. Favorite a model in OpenCode or set OPENCODE_MODEL_PROVIDER and OPENCODE_MODEL_ID.",
            },
          ],
        };
      }

      const currentModel = fetchCurrentModel(context.route);
      const currentModelKey =
        currentModel.providerID && currentModel.modelID
          ? `${currentModel.providerID}/${currentModel.modelID}`
          : "";

      let message = `# Models (${total})\n\n`;
      message += currentModelKey ? `Current: **${currentModelKey}**\n\n` : "Current: not set\n\n";

      const favoriteSection = appendModelSection({
        message,
        title: "Favorites",
        models: favorites,
        startIndex: 1,
        currentModelKey,
      });

      const recentSection = appendModelSection({
        message: favoriteSection.message,
        title: "Recent",
        models: recent,
        startIndex: favoriteSection.nextIndex,
        currentModelKey,
      });

      message = `${recentSection.message}Use \`/model <number>\` to select a model.`;

      return {
        outputs: [{ text: message, format: "markdown" }],
      };
    } catch (error) {
      logger.error("[CoreCommands] Error in models command", error);
      return {
        outputs: [{ text: "❌ Failed to load models." }],
      };
    }
  }
}
