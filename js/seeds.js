/* はじめに入れる見本
   ・初回に一度だけ写す。あとから増やしても、もう開いた端末には届かない
     （設定の「見本から足りないものを足す」で足す。自動では足さない＝消したものがよみがえるため）
   ・残りの数は入れない。「まだ数えていない（—）」から始める
   ・防災の目安は 1人・1週間分（水は1日3L、食事は1日3食、トイレは1日5回） */
var SB = window.SB = window.SB || {};

SB.SEEDS = [
  // 調味料（目安1＝切らさずに1つは置いておく）
  { cat: 'spice', name: 'しょうゆ', unit: '本', target: 1 },
  { cat: 'spice', name: 'みりん', unit: '本', target: 1 },
  { cat: 'spice', name: '料理酒', unit: '本', target: 1 },
  { cat: 'spice', name: '酢', unit: '本', target: 1 },
  { cat: 'spice', name: '砂糖', unit: '袋', target: 1 },
  { cat: 'spice', name: '塩', unit: '袋', target: 1 },
  { cat: 'spice', name: 'こしょう', unit: '本', target: 1 },
  { cat: 'spice', name: 'サラダ油', unit: '本', target: 1 },
  { cat: 'spice', name: 'ごま油', unit: '本', target: 1 },
  { cat: 'spice', name: 'みそ', unit: '個', target: 1 },
  { cat: 'spice', name: 'マヨネーズ', unit: '本', target: 1 },
  { cat: 'spice', name: 'ケチャップ', unit: '本', target: 1 },
  { cat: 'spice', name: '顆粒だし', unit: '袋', target: 1 },
  { cat: 'spice', name: 'コンソメ', unit: '箱', target: 1 },

  // 備品
  { cat: 'supply', name: 'トイレットペーパー', unit: 'ロール', target: 12 },
  { cat: 'supply', name: 'ティッシュ', unit: '箱', target: 5 },
  { cat: 'supply', name: 'キッチンペーパー', unit: 'ロール', target: 2 },
  { cat: 'supply', name: 'ゴミ袋', unit: 'パック', target: 1 },
  { cat: 'supply', name: '食器用洗剤', unit: '本', target: 1 },
  { cat: 'supply', name: '洗濯洗剤', unit: '本', target: 1 },
  { cat: 'supply', name: 'シャンプー', unit: '本', target: 1 },
  { cat: 'supply', name: 'ボディソープ', unit: '本', target: 1 },
  { cat: 'supply', name: 'ハンドソープ', unit: '本', target: 1 },
  { cat: 'supply', name: '歯みがき粉', unit: '本', target: 1 },
  { cat: 'supply', name: 'ラップ', unit: '本', target: 1 },
  { cat: 'supply', name: 'スポンジ', unit: '個', target: 2 },

  // 防災（期限を記録するものと、しないもの）
  { cat: 'bousai', name: '保存水（2L）', unit: '本', target: 12, track: true },
  { cat: 'bousai', name: '非常食', unit: '食', target: 21, track: true },
  { cat: 'bousai', name: '簡易トイレ', unit: '回', target: 35, track: true },
  { cat: 'bousai', name: 'カセットボンベ', unit: '本', target: 3, track: true },
  { cat: 'bousai', name: '乾電池（単3）', unit: '本', target: 8, track: true },
  { cat: 'bousai', name: 'ウェットティッシュ', unit: '個', target: 2, track: true },
  { cat: 'bousai', name: '救急セット', unit: '組', target: 1, track: true },
  { cat: 'bousai', name: 'マスク', unit: '枚', target: 20, track: false },
  { cat: 'bousai', name: '懐中電灯', unit: '個', target: 1, track: false },
  { cat: 'bousai', name: 'モバイルバッテリー', unit: '個', target: 1, track: false },
  { cat: 'bousai', name: '携帯ラジオ', unit: '個', target: 1, track: false }
];
