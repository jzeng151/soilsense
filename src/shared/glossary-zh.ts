import type { GLOSSARY, GlossaryEntry } from "./glossary";

/** Untranslated future entries fall back to English; source titles and URLs remain as published. */
export const GLOSSARY_ZH: Partial<Record<typeof GLOSSARY[number]["id"], Pick<GlossaryEntry, "plain" | "technical" | "definition" | "limit">>> = {
  "irrigation-allocation": {
    plain: "获准使用的灌溉水量", technical: "灌溉配水额度",
    definition: "在规定时间和面积内允许使用的灌溉水量。这是用水上限，并不能证明已经抽水。",
    limit: "SoilSense的限水模式假定每个作物生长季约有10英寸的灌溉水量；请在当地核实法定年度用水上限和水井供水能力。",
  },
  "rainfall-anomaly": {
    plain: "降水量与常年水平的差异", technical: "降水距平",
    definition: "同一日历时段的降水量与所注明的历史基准值之间的差异。",
    limit: "请始终核对基准年份、时段和单位。仅凭降水总量偏低，不能认定作物受损。",
  },
  "historical-replay": {
    plain: "用过去某年的天气进行模拟", technical: "历史气象重演／回报模拟",
    definition: "使用过去某年记录的天气运行模型，同时保持所注明的土壤、成本和用水假设不变。",
    limit: "模型结果不是实测的农田收成，也不是下一季的预测，更不保证方案排名会逆转。",
  },
  "regional-grid": {
    plain: "代表较大区域的天气数据", technical: "区域网格估算值",
    definition: "卫星或模型产品代表所选位置周围的一片区域，而不是该农田内气象站的观测。",
    limit: "选择一个点并不会使原始网格具有单块农田的分辨率。请核对产品数据所代表的空间范围。",
  },
  "et": {
    plain: "返回大气的水分", technical: "蒸散量（ET）",
    definition: "土壤及其他表面的蒸发水量，加上植物通过蒸腾释放的水量。",
    limit: "蒸散包括来自降水和土壤储水的水分，不等于灌溉抽水量。参考蒸散量、模型估算的作物需水量以及实测或估算的实际蒸散量是不同的量。",
  },
  "root-zone-moisture": {
    plain: "植物根部周围的土壤水分", technical: "根区土壤水分",
    definition: "对植物根系吸水所在土层中水分含量的估算。",
    limit: "POWER根区湿润度是陆面模型的估算值，不是这块农田内探头的读数。百分位表示与历史数据相比的相对位置，不是剩余水权的百分比。",
  },
  "ndvi": {
    plain: "绿色植被的信号", technical: "归一化植被指数（NDVI）",
    definition: "通过比较反射的近红外光和红光来描述绿色植被的无量纲指数。",
    limit: "NDVI偏低或缺失并不能证明土壤裸露、缺少作物残茬、发生旱害或种植了某种作物。云、季节和像元内不同地表的混合都会影响结果。",
  },
  "ndti": {
    plain: "可能反映作物残茬的信号", technical: "归一化耕作指数（NDTI）",
    definition: "研究中使用的短波红外指数，在适当校准和掩膜处理后可用于估算残茬覆盖率。",
    limit: "这不是对残茬的直接测量。在此定义NDTI并不表示SoilSense已实现该数据图层。绿色植物、水分、云和土壤都可能影响该指数。",
  },
  "gdd": {
    plain: "作物生长所积累的热量", technical: "生长度日（GDD）",
    definition: "累积超过作物特定基准温度的热量，用于描述生长发育。SoilSense的主要指标采用50°F的基准温度和86°F的上限温度。",
    limit: "模型估算的作物生育期不是对播种、开花或收获的实际观测。不同作物和品种所需的积温不同。",
  },
  "soil-erodibility": {
    plain: "土壤容易被侵蚀的程度", technical: "土壤可蚀性",
    definition: "描述土壤在特定条件下容易被剥离和搬运的土壤性质。",
    limit: "水蚀的K因子与风蚀的可蚀性指标不能互换。任何一个指标本身都不等于侵蚀速率或实测土壤流失量。",
  },
  "margin": {
    plain: "扣除所列成本后的收入", technical: "收益差额／估算净收益",
    definition: "模型估算的作物收入减去模型所包含的成本，通常以每年每英亩的美元金额表示。",
    limit: "这不是保证的利润，也不是完整的农场财务报表。请核对包含了哪些成本、产量假设和价格。",
  },
  "drought-category": {
    plain: "区域干旱等级", technical: "U.S. Drought Monitor干旱等级",
    definition: "综合多种资料与专家判断的每周地图：D0表示异常干燥；D1为中度干旱，D2为严重干旱，D3为极端干旱，D4为特大干旱。",
    limit: "D0不属于干旱等级。区域等级提供背景信息，不能证明某块农田发生了生长胁迫或损失。",
  },
  "reported-use": {
    plain: "申报已使用的水量", technical: "申报的年度用水量",
    definition: "关于特定年份用水量的历史申报记录；堪萨斯州要求水权或用水许可持有人进行申报。",
    limit: "申报水量不等于法定水权、配水额度、水井当前供水能力或当前抽水量。",
  },
  "crop-stage": {
    plain: "估算的作物生长阶段", technical: "模型估算的作物生育期／物候期",
    definition: "通过参考农事历或基于积温的模型，估算作物可能处于哪个生长发育阶段。",
    limit: "这不是对该农田的实际观测。请在当地核实播种日期、品种、出苗情况和实际生育期。",
  },
  "frost-risk": {
    plain: "春季末次冰冻与秋季初次冰冻之间的时间", technical: "无霜期",
    definition: "以日最低气温等于或低于32°F为标准，计算春季最后一次冰冻与秋季第一次冰冻之间的天数。",
    limit: "区域气温估算值不是农田霜冻的实际观测，也不是预报。还需考虑作物的低温敏感性和田间低洼地形。",
  },
  "water-balance": {
    plain: "降水量减去需水量", technical: "气候水分平衡",
    definition: "显示的气象指标是所注明时段的降水量减去模型估算的作物需水量。",
    limit: "这不是完整的农田水量收支、实测抽水量或水权。土壤储水、地表径流和实际灌溉量需要单独考虑。",
  },
};
