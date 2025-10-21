import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Add GET handler for browser visits
export async function GET() {
  return NextResponse.json({ 
    message: 'Zapier webhook endpoint is working! Use POST to submit data.',
    status: 'ready'
  })
}

// Comprehensive Missouri Counties and Cities Lookup
// Keys include "County" for clarity, but we'll strip it when storing
const MISSOURI_COUNTIES = {
  'Adair County': { district: 'CD-6', cities: ['kirksville', 'brashear', 'gibbs', 'novinger'] },
  'Andrew County': { district: 'CD-6', cities: ['savannah', 'amazonia', 'bolckow', 'fillmore', 'helena', 'rosendale'] },
  'Atchison County': { district: 'CD-6', cities: ['rock port', 'fairfax', 'tarkio', 'watson', 'westboro'] },
  'Audrain County': { district: 'CD-3', cities: ['mexico', 'vandalia', 'benton city', 'farber', 'laddonia', 'martinsburg', 'rush hill', 'thompson', 'wellsville'] },
  'Barry County': { district: 'CD-7', cities: ['cassville', 'monett', 'exeter', 'purdy', 'butterfield', 'seligman', 'washburn', 'wheaton'] },
  'Barton County': { district: 'CD-4', cities: ['lamar', 'golden city', 'liberal', 'mindenmines', 'nashville'] },
  'Bates County': { district: 'CD-4', cities: ['butler', 'rich hill', 'adrian', 'amsterdam', 'amoret', 'foster', 'hume', 'merwin', 'rockville'] },
  'Benton County': { district: 'CD-4', cities: ['warsaw', 'lincoln', 'cole camp', 'edwards', 'ionia', 'quincy'] },
  'Bollinger County': { district: 'CD-8', cities: ['marble hill', 'glenallen', 'leopold', 'scopus', 'zalma'] },
  'Boone County': { district: 'CD-4', cities: ['columbia', 'como', 'ashland', 'centralia', 'hallsville', 'harrisburg', 'rocheport', 'sturgeon'] },
  'Buchanan County': { district: 'CD-6', cities: ['st. joseph', 'st joseph', 'agency', 'country club', 'de kalb', 'easton', 'rushville', 'wallace'] },
  'Butler County': { district: 'CD-8', cities: ['poplar bluff', 'fisk', 'neelyville', 'qulin', 'rombauer'] },
  'Caldwell County': { district: 'CD-6', cities: ['kingston', 'braymer', 'breckenridge', 'cowgill', 'hamilton', 'kidder', 'polo'] },
  'Callaway County': { district: 'CD-3', cities: ['fulton', 'auxvasse', 'holts summit', 'kingdom city', 'new bloomfield', 'mokane', 'portland', 'steedman', 'williamsburg'] },
  'Camden County': { district: 'CD-4', cities: ['camdenton', 'lake ozark', 'osage beach', 'climax springs', 'linn creek', 'macks creek', 'roach', 'stoutland', 'sunrise beach'] },
  'Cape Girardeau County': { district: 'CD-8', cities: ['cape girardeau', 'jackson', 'scott city', 'chaffee', 'delta', 'gordonville', 'oak ridge', 'whitewater'] },
  'Carroll County': { district: 'CD-6', cities: ['carrollton', 'bogard', 'bosworth', 'de witt', 'norborne', 'tina'] },
  'Carter County': { district: 'CD-8', cities: ['van buren', 'ellsinore', 'fremont', 'grandin'] },
  'Cass County': { district: 'CD-4', cities: ['belton', 'harrisonville', 'raymore', 'peculiar', 'pleasant hill', 'garden city', 'archie', 'cleveland', 'creighton', 'drexel', 'east lynne', 'freeman', 'lake annette'] },
  'Cedar County': { district: 'CD-4', cities: ['stockton', 'el dorado springs', 'cedar springs', 'dadeville', 'jerico springs', 'umber view heights'] },
  'Chariton County': { district: 'CD-6', cities: ['keytesville', 'brunswick', 'dalton', 'marceline', 'salisbury', 'triplett'] },
  'Christian County': { district: 'CD-7', cities: ['ozark', 'nixa', 'clever', 'billings', 'chadwick', 'highlandville', 'sparta'] },
  'Clark County': { district: 'CD-6', cities: ['kahoka', 'alexandria', 'luray', 'revere', 'st. francisville', 'wayland', 'wyaconda'] },
  'Clay County': { district: 'CD-5', cities: ['liberty', 'gladstone', 'north kansas city', 'excelsior springs', 'kearney', 'smithville', 'oakwood', 'mosby', 'holt', 'avondale', 'claycomo', 'ferrelview', 'glenaire', 'homestead', 'houston lake', 'oakview', 'oakwood park', 'oaks', 'pleasant valley', 'randolph', 'riverside'] },
  'Clinton County': { district: 'CD-6', cities: ['plattsburg', 'cameron', 'lathrop', 'gower', 'trimble', 'turney'] },
  'Cole County': { district: 'CD-3', cities: ['jefferson city', 'jeff city', 'brazito', 'centertown', 'elston', 'lohman', 'russellville', 'st. martins', 'st. thomas', 'taos'] },
  'Cooper County': { district: 'CD-4', cities: ['boonville', 'pilot grove', 'bunceton', 'otterville', 'prairie home', 'speed'] },
  'Crawford County': { district: 'CD-3', cities: ['cuba', 'steelville', 'bourbon', 'leasburg', 'sullivan'] },
  'Dade County': { district: 'CD-7', cities: ['greenfield', 'lockwood', 'dadeville', 'everton'] },
  'Dallas County': { district: 'CD-4', cities: ['buffalo', 'louisburg', 'urbana', 'elkland', 'half way', 'long lane', 'niangua', 'windyville'] },
  'Daviess County': { district: 'CD-6', cities: ['gallatin', 'pattonsburg', 'altamont', 'jameson', 'jamesport', 'lock springs', 'mcfall', 'winston'] },
  'DeKalb County': { district: 'CD-6', cities: ['maysville', 'amity', 'clarksdale', 'cosby', 'osborn', 'stewartsville', 'union star', 'weatherby'] },
  'Dent County': { district: 'CD-8', cities: ['salem', 'jadwin', 'lenox'] },
  'Douglas County': { district: 'CD-8', cities: ['ava', 'cabool', 'dogwood', 'glenwood', 'goodhope', 'graff', 'vanzant'] },
  'Dunklin County': { district: 'CD-8', cities: ['kennett', 'malden', 'campbell', 'cardwell', 'clarkton', 'gobler', 'holcomb', 'hornersville', 'senath'] },
  'Franklin County': { district: 'CD-2', cities: ['washington', 'union', 'pacific', 'st. clair', 'sullivan', 'gerald', 'new haven', 'berger', 'catawissa', 'gray summit', 'labadie', 'leslie', 'lyon', 'parkway', 'rosebud', 'stanton', 'villa ridge'] },
  'Gasconade County': { district: 'CD-3', cities: ['hermann', 'owensville', 'bland', 'mount sterling', 'morrison', 'rosebud'] },
  'Gentry County': { district: 'CD-6', cities: ['albany', 'stanberry', 'king city', 'darlington', 'gentry', 'mcfall'] },
  'Greene County': { district: 'CD-7', cities: ['springfield', 'sgf', 'republic', 'willard', 'strafford', 'ash grove', 'battlefield', 'brookline', 'ebenezer', 'fair grove', 'fremont hills', 'pleasant hope', 'rogersville', 'turners'] },
  'Grundy County': { district: 'CD-6', cities: ['trenton', 'galt', 'laredo', 'spickard', 'tindall'] },
  'Harrison County': { district: 'CD-6', cities: ['bethany', 'cainsville', 'eagleville', 'gilman city', 'martinsville', 'ridgeway'] },
  'Henry County': { district: 'CD-4', cities: ['clinton', 'windsor', 'calhoun', 'deepwater', 'montrose', 'urich', 'blairstown', 'leesville'] },
  'Hickory County': { district: 'CD-4', cities: ['hermitage', 'preston', 'cross timbers', 'flemington', 'weaubleau', 'wheatland'] },
  'Holt County': { district: 'CD-6', cities: ['oregon', 'mound city', 'craig', 'forest city', 'maitland'] },
  'Howard County': { district: 'CD-4', cities: ['fayette', 'glasgow', 'armstrong', 'new franklin'] },
  'Howell County': { district: 'CD-8', cities: ['west plains', 'mountain view', 'willow springs', 'brandsville', 'moody', 'pomona', 'pottersville'] },
  'Iron County': { district: 'CD-8', cities: ['ironton', 'annapolis', 'arcadia', 'pilot knob', 'viburnum'] },
  'Jackson County': { district: 'CD-5', cities: ['kansas city', 'kc', 'kcmo', 'independence', 'blue springs', 'lees summit', "lee's summit", 'raytown', 'grandview', 'grain valley', 'oak grove', 'greenwood', 'lake lotawana', 'lake tapawingo', 'lone jack', 'levasy', 'buckner', 'bates city', 'sibley', 'unity village', 'sugar creek'] },
  'Jasper County': { district: 'CD-7', cities: ['joplin', 'webb city', 'carthage', 'carl junction', 'sarcoxie', 'carterville', 'duenweg', 'oronogo', 'airport drive', 'alba', 'avilla', 'asbury', 'diamond', 'duquesne', 'grand falls plaza', 'la russell', 'purcell', 'reeds', 'waco'] },
  'Jefferson County': { district: 'CD-2', cities: ['arnold', 'festus', 'imperial', 'crystal city', 'herculaneum', 'hillsboro', 'de soto', 'byrnes mill', 'high ridge', 'murphy', 'antonia', 'barnhart', 'cedar hill', 'cedar hill lakes', 'dittmer', 'fletcher', 'fountain n lakes', 'Goldman', 'horine', 'kimmswick', 'mapaville', 'maxville', 'olympian village', 'otto', 'pevely', 'seckman', 'sunnyside', 'valles mines', 'victoria'] },
  'Johnson County': { district: 'CD-4', cities: ['warrensburg', 'holden', 'knob noster', 'centerview', 'chilhowee', 'kingsville', 'leeton'] },
  'Knox County': { district: 'CD-6', cities: ['edina', 'knox city', 'baring', 'hurdland', 'plevna'] },
  'Laclede County': { district: 'CD-4', cities: ['lebanon', 'conway', 'richland', 'phillipsburg', 'stoutland', 'bennett spring', 'eldridge', 'falcon', 'morgan heights', 'competition', 'sleeper'] },
  'Lafayette County': { district: 'CD-4', cities: ['lexington', 'higginsville', 'odessa', 'concordia', 'alma', 'corder', 'mayview', 'wellington', 'aullville', 'bates city', 'dover', 'emma', 'napoleon', 'waterloo', 'waverly'] },
  'Lawrence County': { district: 'CD-7', cities: ['mount vernon', 'aurora', 'marionville', 'miller', 'monett', 'pierce city', 'stotts city', 'verona', 'freistatt', 'halltown', 'la russell'] },
  'Lewis County': { district: 'CD-6', cities: ['canton', 'la grange', 'monticello', 'durham', 'ewing', 'lewistown'] },
  'Lincoln County': { district: 'CD-2', cities: ['troy', 'wentzville', 'moscow mills', 'winfield', 'elsberry', 'bowling green', 'foley', 'hawk point', 'old monroe', 'truesdale', 'davis', 'silex'] },
  'Linn County': { district: 'CD-6', cities: ['brookfield', 'linneus', 'laclede', 'meadville', 'marceline', 'bucklin', 'browning', 'purdin'] },
  'Livingston County': { district: 'CD-6', cities: ['chillicothe', 'utica', 'dawn', 'mooresville', 'ludlow', 'wheeling'] },
  'Macon County': { district: 'CD-6', cities: ['macon', 'bevier', 'la plata', 'atlanta', 'new cambria', 'anabel', 'callao', 'elmer', 'ethel'] },
  'Madison County': { district: 'CD-8', cities: ['fredericktown', 'marquand', 'st. mary', 'mine la motte'] },
  'Maries County': { district: 'CD-3', cities: ['vienna', 'belle', 'vichy', 'dixon', 'westphalia', 'brinktown'] },
  'Marion County': { district: 'CD-6', cities: ['hannibal', 'palmyra', 'philadelphia', 'monroe city', 'la grange'] },
  'McDonald County': { district: 'CD-7', cities: ['pineville', 'anderson', 'goodman', 'noel', 'south west city', 'rocky comfort', 'splitlog', 'tiff city', 'lanagan'] },
  'Mercer County': { district: 'CD-6', cities: ['princeton', 'mercer', 'cainsville', 'ravanna', 'harris'] },
  'Miller County': { district: 'CD-4', cities: ['tuscumbia', 'eldon', 'iberia', 'olean', 'brumley', 'st. anthony', 'st. elizabeth', 'lake ozark', 'rocky mount'] },
  'Mississippi County': { district: 'CD-8', cities: ['charleston', 'east prairie', 'wyatt', 'anniston', 'bertrand', 'big oak tree', 'dorena', 'howardville', 'pinhook', 'wolf island'] },
  'Moniteau County': { district: 'CD-4', cities: ['california', 'tipton', 'jamestown', 'clarksburg', 'high point', 'latham', 'lupus'] },
  'Monroe County': { district: 'CD-6', cities: ['paris', 'madison', 'holliday', 'santa fe', 'stoutsville', 'granville', 'hunnewell'] },
  'Montgomery County': { district: 'CD-3', cities: ['montgomery city', 'wellsville', 'bellflower', 'jonesburg', 'middletown', 'new florence', 'high hill'] },
  'Morgan County': { district: 'CD-4', cities: ['versailles', 'stover', 'gravois mills', 'laurie', 'rocky mount', 'barnett', 'florence'] },
  'New Madrid County': { district: 'CD-8', cities: ['new madrid', 'portageville', 'lilbourn', 'marston', 'canalou', 'catron', 'gideon', 'howardville', 'kewanee', 'matthews', 'parma', 'risco', 'tallapoosa'] },
  'Newton County': { district: 'CD-7', cities: ['neosho', 'granby', 'seneca', 'diamond', 'newtonia', 'stark city', 'racine', 'ritchey', 'saginaw', 'shoal creek drive', 'stella'] },
  'Nodaway County': { district: 'CD-6', cities: ['maryville', 'burlington junction', 'clearmont', 'elmo', 'graham', 'hopkins', 'maitland', 'pickering', 'ravenwood', 'skidmore'] },
  'Oregon County': { district: 'CD-8', cities: ['alton', 'thayer', 'couch', 'koshkonong', 'myrtle', 'bardley'] },
  'Osage County': { district: 'CD-3', cities: ['linn', 'belle', 'freeburg', 'westphalia', 'argyle', 'bland', 'bonnots mill', 'chamois', 'koeltztown', 'loose creek', 'meta', 'rich fountain', 'ryors'] },
  'Ozark County': { district: 'CD-8', cities: ['gainesville', 'theodosia', 'bakersfield', 'brixey', 'dora', 'hardenville', 'isabella', 'noble', 'pontiac', 'riverton', 'rueter', 'zanoni'] },
  'Pemiscot County': { district: 'CD-8', cities: ['caruthersville', 'hayti', 'steele', 'holland', 'braggadocio', 'cooter', 'gosnell', 'hayti heights', 'homestown', 'pascola', 'portageville', 'wardell'] },
  'Perry County': { district: 'CD-8', cities: ['perryville', 'st. mary', 'altenburg', 'biehle', 'brazeau', 'crosstown', 'farrar', 'frohna', 'longtown', 'mcbride', 'uniontown'] },
  'Pettis County': { district: 'CD-4', cities: ['sedalia', 'smithton', 'green ridge', 'hughesville', 'la monte', 'windsor place', 'houstonia', 'dresden'] },
  'Phelps County': { district: 'CD-8', cities: ['rolla', 'st. james', 'newburg', 'cuba', 'doolittle', 'edgar springs', 'lenox', 'st. cloud', 'yancy mills'] },
  'Pike County': { district: 'CD-3', cities: ['bowling green', 'louisiana', 'clarksville', 'curryville', 'eolia', 'farber', 'frankford', 'new hartford', 'paynesville', 'vandalia'] },
  'Platte County': { district: 'CD-6', cities: ['platte city', 'parkville', 'weston', 'edgerton', 'ferrelview', 'lake waukomis', 'platte woods', 'riverside', 'tracy', 'weatherby lake', 'houston lake', 'dearborn'] },
  'Polk County': { district: 'CD-4', cities: ['bolivar', 'humansville', 'fair play', 'half way', 'aldrich', 'brighton', 'dunnegan', 'flemington', 'morrisville', 'pleasant hope', 'polk'] },
  'Pulaski County': { district: 'CD-4', cities: ['waynesville', 'fort leonard wood', 'st. robert', 'crocker', 'dixon', 'richland', 'laquey', 'devil\'s elbow'] },
  'Putnam County': { district: 'CD-6', cities: ['unionville', 'downing', 'glenwood', 'livonia', 'lucerne', 'powersville', 'reger'] },
  'Ralls County': { district: 'CD-3', cities: ['new london', 'center', 'perry', 'saverton'] },
  'Randolph County': { district: 'CD-6', cities: ['moberly', 'huntsville', 'cairo', 'clark', 'clifton hill', 'higbee', 'jacksonville', 'renick'] },
  'Ray County': { district: 'CD-6', cities: ['richmond', 'excelsior springs', 'hardin', 'lawson', 'orrick', 'braymer', 'henrietta', 'knoxville', 'rayville', 'woods heights'] },
  'Reynolds County': { district: 'CD-8', cities: ['ellington', 'centerville', 'reynolds', 'black', 'bunker', 'lesterville', 'redford'] },
  'Ripley County': { district: 'CD-8', cities: ['doniphan', 'current view', 'gatewood', 'naylor', 'oxly', 'shook'] },
  'Saline County': { district: 'CD-4', cities: ['marshall', 'slater', 'malta bend', 'sweet springs', 'gilliam', 'blackburn', 'grand pass', 'miami', 'nelson'] },
  'Schuyler County': { district: 'CD-6', cities: ['lancaster', 'queen city', 'downing', 'glenwood'] },
  'Scotland County': { district: 'CD-6', cities: ['memphis', 'downing', 'gorin', 'granger', 'kahoka', 'rutledge'] },
  'Scott County': { district: 'CD-8', cities: ['sikeston', 'scott city', 'benton', 'chaffee', 'commerce', 'kelso', 'morley', 'oran', 'vanduser'] },
  'Shannon County': { district: 'CD-8', cities: ['eminence', 'birch tree', 'winona', 'alley spring', 'cardareva', 'montier', 'summersville'] },
  'Shelby County': { district: 'CD-6', cities: ['shelbyville', 'clarence', 'bethel', 'emden', 'hunnewell', 'leonard', 'lentner', 'shelbina'] },
  'St. Charles County': { district: 'CD-2', cities: ['st. charles', 'st charles', 'ofallon', "o'fallon", 'st. peters', 'st peters', 'wentzville', 'lake st. louis', 'dardenne prairie', 'cottleville', 'weldon spring', 'st. paul', 'new melle', 'augusta', 'flint hill', 'foristell', 'portage des sioux', 'west alton'] },
  'St. Clair County': { district: 'CD-4', cities: ['osceola', 'appleton city', 'lowry city', 'roscoe', 'deepwater', 'eldorado springs', 'gerster', 'iconium', 'milford', 'montevallo', 'monegaw springs', 'taberville', 'vista'] },
  'St. Francois County': { district: 'CD-8', cities: ['farmington', 'park hills', 'leadwood', 'flat river', 'bonne terre', 'desloge', 'st. mary', 'bismarck', 'blackwell', 'doe run', 'elvins', 'esther', 'irondale', 'knob lick', 'leadington', 'river aux vases', 'victoria'] },
  'St. Louis County': { district: 'CD-1', cities: ['st. louis county', 'stl county', 'ballwin', 'chesterfield', 'clayton', 'creve coeur', 'ferguson', 'florissant', 'hazelwood', 'kirkwood', 'maryland heights', 'university city', 'u city', 'webster groves', 'wildwood', 'affton', 'bella villa', 'bel-nor', 'bel-ridge', 'bellefontaine neighbors', 'berkeley', 'beverly hills', 'black jack', 'breckenridge hills', 'brentwood', 'bridgeton', 'bridgeton', 'brookings', 'calverton park', 'castle point', 'charlack', 'cityview', 'clarkson valley', 'clayton', 'cool valley', 'country club hills', 'country life acres', 'crestwood', 'crystal lake park', 'dellwood', 'des peres', 'edmundson', 'ellsville', 'eureka', 'fenton', 'flordell hills', 'frontenac', 'glen echo park', 'glendale', 'glen ridge', 'goodfellow park', 'grant city', 'grantwood village', 'green park', 'hanley hills', 'hillsdale', 'hungarian village', 'huntleigh', 'jennings', 'kinloch', 'ladue', 'lakeshire', 'mackenzie', 'manchester', 'maplewood', 'marlborough', 'martindale', 'maryland heights', 'moline acres', 'murphy', 'new haven', 'normandy', 'northwoods', 'norwood court', 'oakland', 'olivette', 'overland', 'pagedale', 'pasadena hills', 'pasadena park', 'pine lawn', 'piner hills', 'richmond heights', 'riverview', 'rock hill', 'sappington', 'shrewsbury', 'spanish lake', 'st. ann', 'st. george', 'st. john', 'sunset hills', 'sycamore hills', 'town and country', 'twin oaks', 'uplands park', 'valley park', 'velda city', 'velda village hills', 'vinita park', 'vinita terrace', 'warson woods', 'wellston', 'westwood', 'wilbur park', 'winchester', 'woodson terrace'] },
  'St. Louis City': { district: 'CD-1', cities: ['st. louis', 'st louis', 'stl'] },
  'Ste. Genevieve County': { district: 'CD-8', cities: ['ste. genevieve', 'st. mary', 'bloomsdale', 'river aux vases', 'st. mary', 'zell'] },
  'Stoddard County': { district: 'CD-8', cities: ['dexter', 'bloomfield', 'bernie', 'advance', 'bell city', 'essex', 'grayridge', 'mingo', 'morehouse', 'puxico'] },
  'Stone County': { district: 'CD-7', cities: ['branson', 'branson west', 'crane', 'galena', 'hurley', 'indian point', 'kimberling city', 'reeds spring', 'table rock'] },
  'Sullivan County': { district: 'CD-6', cities: ['milan', 'green city', 'humphreys', 'newtown', 'pollock', 'reger', 'unionville', 'worthington'] },
  'Taney County': { district: 'CD-7', cities: ['branson', 'forsyth', 'hollister', 'rockaway beach', 'bull creek', 'kirbyville', 'merriam woods', 'point lookout', 'powersite', 'ridgedale', 'taneyville'] },
  'Texas County': { district: 'CD-8', cities: ['houston', 'licking', 'cabool', 'mountain grove', 'summersville', 'boone creek', 'bucyrus', 'elk creek', 'eunice', 'hartshorn', 'huggins', 'plato', 'roby', 'solo', 'success', 'tyrone'] },
  'Vernon County': { district: 'CD-4', cities: ['nevada', 'el dorado springs', 'walker', 'bronaugh', 'deerfield', 'harwood', 'horton', 'metz', 'moundville', 'richards', 'schell city', 'sheldon', 'stotesbury'] },
  'Warren County': { district: 'CD-2', cities: ['warrenton', 'wright city', 'marthasville', 'truesdale', 'innsbrook', 'jonesburg', 'aspenhoff', 'case', 'dutzow'] },
  'Washington County': { district: 'CD-8', cities: ['potosi', 'caledonia', 'de lassus', 'irondale', 'kingsbury', 'mineral point', 'richwoods', 'tiff', 'old mines'] },
  'Wayne County': { district: 'CD-8', cities: ['piedmont', 'greenville', 'patterson', 'williamsville', 'brunot', 'clearwater', 'lowndes', 'mill spring', 'silva', 'wappapello'] },
  'Webster County': { district: 'CD-7', cities: ['marshfield', 'seymour', 'fordland', 'niangua', 'rogersville', 'diggins', 'fidelity', 'hazelgreen', 'northview', 'strafford'] },
  'Worth County': { district: 'CD-6', cities: ['grant city', 'worth', 'allendale', 'denver', 'isadora', 'sheridan'] },
  'Wright County': { district: 'CD-8', cities: ['hartville', 'mansfield', 'mountain grove', 'ava', 'cabool', 'gracemont', 'macomb', 'manes', 'solo', 'vanzant'] }
}

// Expand common Missouri city abbreviations
function expandMissouriCity(address) {
  if (!address) return address
  
  const cityAbbreviations = {
    'KC': 'Kansas City',
    'KCMO': 'Kansas City',
    'STL': 'St. Louis',
    'SGF': 'Springfield',
    'CoMo': 'Columbia',
    'COMO': 'Columbia',
  }
  
  let expandedAddress = address
  
  // Check if address starts with or contains any abbreviation
  for (const [abbrev, fullName] of Object.entries(cityAbbreviations)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi')
    expandedAddress = expandedAddress.replace(regex, fullName)
  }
  
  return expandedAddress
}

// Strip "County" from county name for storage
function stripCountySuffix(countyName) {
  if (!countyName) return null
  return countyName.replace(/ County$/i, '').trim()
}

// Function to geocode address and get county + congressional district
async function getLocationInfo(address) {
  if (!address || address.trim() === '') {
    return { county: null, district: null }
  }

  try {
    // First, try hardcoded city lookup (fastest and most accurate for MO)
    const cityLookup = lookupByCity(address)
    if (cityLookup.county && cityLookup.district) {
      return cityLookup
    }

    // Expand city abbreviations
    let processedAddress = expandMissouriCity(address)
    
    // Always append Missouri to the address for better geocoding
    if (!processedAddress.toLowerCase().includes('missouri') && !processedAddress.toLowerCase().includes(' mo')) {
      processedAddress = processedAddress + ', Missouri'
    }
    
    // Try US Census Geocoding API
    const encodedAddress = encodeURIComponent(processedAddress)
    const geocodeUrl = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodedAddress}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`
    
    const response = await fetch(geocodeUrl)
    const data = await response.json()
    
    if (data.result?.addressMatches?.[0]) {
      const match = data.result.addressMatches[0]
      const geographies = match.geographies
      
      // Get county name and strip "County" suffix
      let county = geographies['Counties']?.[0]?.NAME || null
      county = stripCountySuffix(county)
      
      // Get congressional district
      const districtData = geographies['2020 Census Public Use Microdata Areas']?.[0] || 
                          geographies['116th Congressional Districts']?.[0] ||
                          geographies['Congressional Districts']?.[0]
      
      let district = districtData?.BASENAME || districtData?.CD116FP || districtData?.GEOID || null
      
      // Clean up district format and add CD- prefix
      if (district) {
        const match = district.match(/\d+/)
        district = match ? `CD-${match[0]}` : district
      }
      
      return { county, district }
    }
    
    // If geocoding fails, try zip code lookup
    const zipMatch = address.match(/\b\d{5}\b/)
    if (zipMatch) {
      return await lookupByZipCode(zipMatch[0])
    }
    
    return { county: null, district: null }
    
  } catch (error) {
    console.error('Geocoding error:', error)
    
    // Fallback: try zip code if present
    const zipMatch = address.match(/\b\d{5}\b/)
    if (zipMatch) {
      return await lookupByZipCode(zipMatch[0])
    }
    
    return { county: null, district: null }
  }
}

// Fallback: lookup by Missouri zip code
async function lookupByZipCode(zipCode) {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`)
    const data = await response.json()
    
    if (data.places?.[0]) {
      const place = data.places[0]
      
      // Get county and strip "County" suffix
      let county = place['county'] || null
      county = stripCountySuffix(county)
      
      // Estimate congressional district based on zip
      const district = estimateDistrictFromZip(zipCode)
      
      return { county, district }
    }
    
    return { county: null, district: null }
  } catch (error) {
    console.error('Zip lookup error:', error)
    return { county: null, district: null }
  }
}

// Lookup by city name using hardcoded Missouri data
function lookupByCity(address) {
  if (!address) return { county: null, district: null }
  
  const normalizedAddress = address.toLowerCase().trim()
  
  // Search through all counties and their cities
  for (const [countyName, countyData] of Object.entries(MISSOURI_COUNTIES)) {
    for (const city of countyData.cities) {
      if (normalizedAddress.includes(city)) {
        return {
          county: stripCountySuffix(countyName),
          district: countyData.district
        }
      }
    }
  }
  
  return { county: null, district: null }
}

// Rough estimate of MO congressional district by zip code
function estimateDistrictFromZip(zip) {
  const zipPrefix = zip.substring(0, 3)
  
  // Missouri zip code ranges to congressional district mapping
  const districtMap = {
    // Kansas City area
    '640': 'CD-5', '641': 'CD-5', '642': 'CD-6',
    // St. Louis area
    '630': 'CD-1', '631': 'CD-1', '632': 'CD-2', '633': 'CD-1',
    // Columbia area
    '650': 'CD-4', '652': 'CD-4',
    // Springfield area
    '656': 'CD-7', '657': 'CD-7', '658': 'CD-7',
    // Jefferson City
    '651': 'CD-3',
    // Southeast MO
    '636': 'CD-8', '637': 'CD-8', '638': 'CD-8', '639': 'CD-8',
    // Northwest MO
    '644': 'CD-6', '645': 'CD-6', '646': 'CD-6',
  }
  
  return districtMap[zipPrefix] || null
}

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const formData = await request.json()
    
    // Format phone to E.164
    let phone_e164 = formData.phone
    if (phone_e164) {
      phone_e164 = phone_e164.replace(/[\s\-\(\)]/g, '')
      if (!phone_e164.startsWith('+')) {
        phone_e164 = phone_e164.startsWith('1') && phone_e164.length === 11
          ? '+' + phone_e164
          : '+1' + phone_e164
      }
    }

    // Helper function to safely convert Yes/No to boolean (only for true boolean fields)
    const toBoolean = (value) => {
      if (!value || value === '') return null
      if (value === 'Yes') return true
      if (value === 'No') return false
      return null // Default to null for any unexpected value
    }

    // Get county and congressional district from address
    const locationInfo = await getLocationInfo(formData.address)
    
    const county = formData.county || locationInfo.county
    const congressional_district = formData.congressional_district || locationInfo.district

    const memberData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      phone_e164: phone_e164,
      date_of_birth: formData.date_of_birth,
      preferred_pronouns: formData.preferred_pronouns,
      gender_identity: formData.gender_identity, // Text: stores "Prefer not to say"
      address: formData.address,
      county: county,
      congressional_district: congressional_district,
      race: formData.race, // Text: stores "Prefer not to say"
      sexual_orientation: formData.sexual_orientation, // Text: stores "Prefer not to say"
      desire_to_lead: toBoolean(formData.desire_to_lead), // Boolean: Yes/No only
      hours_per_week: formData.hours_per_week,
      education_level: formData.education_level,
      registered_voter: toBoolean(formData.registered_voter), // Boolean: Yes/No only
      in_school: formData.in_school, // Text: stores "Yes", "No", or "Prefer not to say"
      school_name: formData.school_name,
      employed: formData.employed, // Text: stores "Yes", "No", or "Prefer not to say"
      industry: formData.industry,
      hispanic_latino: formData.hispanic_latino,
      accommodations: formData.accommodations,
      community_type: formData.community_type,
      languages: formData.languages,
      why_join: formData.why_join,
      committee: formData.committee,
      notes: formData.notes,
      created_at: new Date().toISOString(),
    }

    // Upsert member
    const { data, error } = await supabase
      .from('members')
      .upsert(memberData, {
        onConflict: 'email'
      })
      .select()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      data: data,
      geocoded: {
        county: locationInfo.county,
        district: locationInfo.district
      }
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 })
  }
}