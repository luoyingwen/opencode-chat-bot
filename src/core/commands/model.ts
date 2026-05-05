import { getModelSelectionLists } from "../../model/manager.js";
import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class ModelCommandHandler implements CommandHandler {
  readonly command = "model";

  async handle(context: CommandContext): Promise<CommandResult> {
    const trimmedArg = context.command.args.trim();

    if (!trimmedArg) {
      return {
        outputs: [
          {
            text: "❌ Please provide a model number. Use `/models` to see the list.",
          },
        ],
      };
    }

    const index = Number.parseInt(trimmedArg, 10);
    if (Number.isNaN(index) || index < 1) {
      return {
        outputs: [{ text: "❌ Invalid model number. Use `/models` to see the list." }],
      };
    }

    try {
      const { favorites, recent } = await getModelSelectionLists();
      const models = [...favorites, ...recent];

      if (index > models.length) {
        return {
          outputs: [
            {
              text: `❌ Model #${index} not found. Only ${models.length} models available.`,
            },
          ],
        };
      }

      const selected = models[index - 1];
      await context.runtime.update(context.route, {
        currentModel: {
          providerID: selected.providerID,
          modelID: selected.modelID,
          variant: "default",
        },
      });

      return {
        outputs: [
          {
            text: `✅ Model selected: **${selected.providerID}/${selected.modelID}**`,
            format: "markdown",
          },
        ],
        effects: { modelChanged: true },
      };
    } catch (error) {
      logger.error("[CoreCommands] Error selecting model by index", error);
      return {
        outputs: [{ text: "❌ Failed to select model." }],
      };
    }
  }
}
