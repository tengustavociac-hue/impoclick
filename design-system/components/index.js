// @ts-check
// Ponto de entrada público da biblioteca. Importe sempre daqui — o lint recusa
// import direto de components/<grupo>/*.js fora da própria biblioteca.
//
//   import { Button, Card, Stat } from '../design-system/components/index.js';
//
// 29 componentes, os mesmos do export do Claude Design.

// core
export { Icon } from './core/Icon.js';
export { Button } from './core/Button.js';
export { IconButton } from './core/IconButton.js';
export { Card } from './core/Card.js';
export { Badge } from './core/Badge.js';
export { Tag } from './core/Tag.js';
export { Avatar, AvatarGroup } from './core/Avatar.js';
export { Stat } from './core/Stat.js';
export { ProgressBar } from './core/ProgressBar.js';

// forms
export { Input } from './forms/Input.js';
export { Select } from './forms/Select.js';
export { Checkbox } from './forms/Checkbox.js';
export { Switch } from './forms/Switch.js';
export { SegmentedControl } from './forms/SegmentedControl.js';

// navigation
export { TopBar } from './navigation/TopBar.js';
export { NavPills } from './navigation/NavPills.js';
export { SideNav } from './navigation/SideNav.js';
export { Tabs } from './navigation/Tabs.js';
export { Breadcrumbs } from './navigation/Breadcrumbs.js';

// feedback
export { Alert } from './feedback/Alert.js';
export { Toast } from './feedback/Toast.js';
export { Tooltip } from './feedback/Tooltip.js';
export { EmptyState } from './feedback/EmptyState.js';

// data
export { DataTable } from './data/DataTable.js';
export { Timeline } from './data/Timeline.js';
export { SparkBars } from './data/SparkBars.js';
export { DonutMeter, Legend } from './data/DonutMeter.js';

// Utilitários de montagem, para padrões e telas compostos com a biblioteca.
export { h, cx } from './dom.js';
