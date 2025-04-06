export const confidenceLevels = [
  { label: 'Strongly agree', text: 'strongly agree', value: 'strongly agree' },
  { label: 'Agree', text: 'agree', value: 'agree' },
  { label: 'Slightly agree', text: 'slightly agree', value: 'slightly agree' },
  { label: 'Neutral', text: 'neither agree nor disagree', value: 'neutral' },
  { label: 'Slightly disagree', text: 'slightly disagree', value: 'slightly disagree' },
  { label: 'Disagree', text: 'disagree', value: 'disagree' },
  { label: 'Strongly disagree', text: 'strongly disagree', value: 'strongly disagree' },
]

export const confidenceLevelsOrdered = confidenceLevels.map((level) => level.value)
