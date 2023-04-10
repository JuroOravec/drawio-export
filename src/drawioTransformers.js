// 
// Transformers that process extracted data from the XML content of a <diagram> element in a .drawio file
// 

const transformConnectQuestions = (data) => {
  const {
    assumptions,
    questions
  } = data || {};

  const assumptionCache = assumptions.result.reduce((agg, assump) => {
    agg[assump.nodeId] = assump;
    return agg;
  }, {});

  questions.result.forEach((quest) => {
    quest.targetIds.forEach((questTargetId) => {
      const assump = assumptionCache[questTargetId];
      if (!assump) return;
      assump.questions = (assump.questions || []);
      assump.questions.push(quest);
      
      quest.assumptions = (quest.assumptions || []);
      quest.assumptions.push(assump);
    });
  });

  return data;
};

const transformConnectContainers = (data) => {
  const {
    assumptions,
    containers,
  } = data || {};

  const containerCache = containers.result.all.reduce((agg, container) => {
    agg[container.nodeId] = container;
    return agg;
  }, {});

  assumptions.result.forEach((assump) => {
    const container = containerCache[assump.parentId];
    if (!container) return;
    assump.container = container;

    container.assumptions = (container.assumptions || []);
    container.assumptions.push(assump);
  });

  return data;
};

module.exports = {
  transformConnectQuestions,
  transformConnectContainers,
}