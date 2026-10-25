import type { TemplateDefinition } from "../types";

export const templates: TemplateDefinition[] = [
  {
    id: "general",
    name: "通用优化",
    shortName: "GENERAL",
    description: "不限定领域，按任务本身澄清",
    focus:
      "不要预设专业领域。重点澄清真实目标、使用背景、目标受众、关键约束、已有材料、成功标准与期望输出形式。最终提示词保持通用、准确、可执行。",
    accent: "#b99aff",
    example: "帮我把这个想法整理成一份可执行的行动计划……",
  },
  {
    id: "academic",
    name: "学术写作",
    shortName: "ACADEMIC",
    description: "论文、综述与研究方法",
    focus:
      "优先澄清研究问题、学科领域、证据标准、目标期刊或读者、篇幅与引用规范。最终提示词必须强调论证严谨性、可核验性与学术边界。",
    accent: "#70e1b6",
    example: "帮我写一段关于固态电池界面稳定性的文献综述……",
  },
  {
    id: "code",
    name: "代码生成",
    shortName: "ENGINEERING",
    description: "功能设计、实现与调试",
    focus:
      "优先澄清技术栈、运行环境、输入输出、性能与安全约束、验收方式。最终提示词必须要求可运行代码、错误处理、测试和明确假设。",
    accent: "#7ca7ff",
    example: "做一个带筛选和分页的后台用户列表……",
  },
  {
    id: "copywriting",
    name: "文案创作",
    shortName: "COPYWRITING",
    description: "品牌、营销与内容表达",
    focus:
      "优先澄清品牌定位、目标受众、传播渠道、语气、核心卖点、行动目标与禁用表达。最终提示词必须给出清晰结构、语气样例和输出规格。",
    accent: "#ffb86b",
    example: "为我的效率工具写一组新产品发布文案……",
  },
  {
    id: "image-generation",
    name: "图像生成",
    shortName: "IMAGE",
    description: "视觉概念、海报与插画生成",
    focus:
      "优先澄清画面主体、用途与发布平台、视觉风格、构图与镜头、配色、光影、材质、画幅比例、文字要求、品牌资产和禁止元素。最终提示词必须清楚区分主体、环境、构图、风格、光线、色彩与输出参数。涉及真实人物、品牌标志或知名 IP 时，提示用户确认授权、肖像权和平台政策，但不要仅因出现相关名称就拒绝生成。",
    accent: "#ef8bc7",
    example: "生成一张适合新品发布会的未来感产品海报，比例 3:4……",
  },
];

export function findTemplate(
  templateId: string,
  availableTemplates: TemplateDefinition[] = templates,
) {
  return (
    availableTemplates.find((template) => template.id === templateId) ??
    availableTemplates.find((template) => template.id === "general") ??
    templates[0]
  );
}
