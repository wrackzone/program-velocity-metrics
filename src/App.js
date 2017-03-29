 Ext.define('Ext.chart.theme.ColumnTheme', {
    extend: 'Ext.chart.theme.Base',
    constructor: function(config) {
        this.callParent([Ext.apply({ 
           
            colors: ['STEELBLUE','seagreen']

        }, config)]);
    }
});


Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items : [ 
        {
            margins:'5 5 5 5',
            itemId : 'chart-container',
            layout : 'column'
        },
        {
            margins:'5 5 5 5',
            itemId : 'tab-panel-container',
            layout : 'fit'
        }
    ],

    keys : ['PlannedCount','CompletedCount','Planned PE','Completed PE','Planned Points','Completed Points'],

    launch: function() {

    	var that = this;


        that.rallyFunctions = Ext.create("RallyFunctions",{ 
            ctx : that.getContext(),
        	keys : ['peValues','iterations','projects','projectReleases','piTypes']
        });

        that.showMask("Loading release data...");
        that.rallyFunctions.readRallyItems(function(error,bundle){
        	console.log("rallyFunctions",error,bundle);
            that.bundle = bundle;
            that.readReleaseFeatureSnapshots();
        });
    },

    readReleaseFeatureSnapshots : function() 
    {
        // read project release feature snapshots
        // data structure project -> release -> start snapshots, end snapshots
        var that = this;
        that.showMask("Loading snapshots...");

        var prs = _.sortBy(that.bundle.projectReleases,function(pr) {
            return pr.project.get("Name");
        })

        var reqs = [];
        _.each(prs,function(pr) {
            _.each(pr.releases,function(lr){
                reqs.push({start:true,logicalRelease:lr});
                reqs.push({start:false,logicalRelease:lr});
            })
        })

        async.map(reqs, 
            that._asyncLoadSnapshotsForReleaseDate.bind(that), 
            function(error,results) {
                that.hideMask();
                that._showTable();
            }
        )

        
    },

    showMask: function(msg) {
        if ( this.getEl() ) { 
            this.getEl().unmask();
            this.getEl().mask(msg);
        }
    },
    hideMask: function() {
        this.getEl().unmask();
    },


    _showTable : function() {

        console.log("_showTable");

        var that = this;
        var rows = [];

        var uniqReleases = _.flatten(_.map(that.bundle.projectReleases,function(pr){
            return pr.releases;
        }))
        uniqReleases = _.uniq(uniqReleases,function(lr){
            return lr.name;
        })
        that.bundle.uniqReleases = _.sortBy(uniqReleases,function(lr){
            return lr.releaseDate;
        })
        var rows = [];

        _.each(that.bundle.projectReleases,function(pr) {
            _.each(that.keys,function(key){
                rows.push(that._makeRow(pr,key));
            })
        });

        that.down("#tab-panel-container").add(that._createTabPanel(rows));

    },

    _createSeries : function(rows,keys) {
        var that = this;

        var series = _.map(keys,function(key) {
            var row = _.find(rows,function(row) {
                return row.key === key;
            });

            return {
                name : key,
                data : _.map(that.bundle.uniqReleases,function(ur){
                    return row[ur.name];
                })
            }
        })

        return series;
    },

    _createTabPanel : function(rows) {

        console.log("_createTabPanel");
        var that = this;

        that.tabPanel = Ext.create('Ext.tab.Panel', {
            items: [{
                title: 'Count',
                items : that._createTable(rows,["PlannedCount","CompletedCount"])
            }, {
                title: 'Estimate',
                items : that._createTable(rows,["Planned PE","Completed PE"])
            },{
                title: 'Points',
                items : that._createTable(rows,["Planned Points","Completed Points"])
            }]
        });
        return that.tabPanel;
    },

    _makeRow : function(pr,key) {
        var that = this;
        console.log("pr",pr);
        var row = { project : pr.project.get("Name"), key : key };

        _.each(that.bundle.uniqReleases, function(ur) {
            var lr = _.find(pr.releases,function(lr) { return lr.name == ur.name});
            if (_.isNull(lr)||_.isUndefined(lr))
                row[ur.name] = null;
            else {
                row[ur.name] = that._setRowValue(key,lr);
            }
        })
        return row;
    },

    _setRowValue : function(key, lr) {
        var that = this;
        var value = 0;

        var peValue = function(snapshot) {
            var pev = _.find(that.bundle.preliminaryEstimateValues,function(p) {
                return p.get("ObjectID") === snapshot.PreliminaryEstimate;
            });
            return _.isUndefined(pev) ? 0 : pev.get("Value");
        };

        var storyPointValue = function(snapshot) {
            return (!_.isUndefined(snapshot.LeafStoryPlanEstimateTotal) &&
                !_.isNull(snapshot.LeafStoryPlanEstimateTotal)) ? 
                snapshot.LeafStoryPlanEstimateTotal : 0;
        };

        switch(key) {
            case "PlannedCount":
                value = lr.snapshots.start.length == 0 ? null : lr.snapshots.start.length; break;
            case "CompletedCount":
                //row[ur.name] = lr.snapshots.end.length == 0 ? null : lr.snapshots.end.length; break;
                value = lr.snapshots.completed.length == 0 ? null : lr.snapshots.completed.length; break;
            case "Planned PE":
                var total = _.reduce(lr.snapshots.start,function(memo,snap) {
                    return memo + peValue(snap);
                },0);
                value = total == 0 ? null : total; 
                break;
            case "Completed PE":
                var total = _.reduce(lr.snapshots.completed, function(memo,snap) {
                    return memo + peValue(snap);
                },0);
                value = total == 0 ? null : total;
                break;
            case "Planned Points":
                var total = _.reduce(lr.snapshots.start,function(memo,snap) {
                    return memo + storyPointValue(snap);
                },0);
                value = total == 0 ? null : total; 
                break;
            case "Completed Points":
                var total = _.reduce(lr.snapshots.completed,function(memo,snap) {
                    return memo + storyPointValue(snap);
                },0);
                value = total == 0 ? null : total;
                break;
        }
        return value;
    },

    _createTable : function(rows,keys) {
        var that = this;

        var releaseColumns = _.map(that.bundle.uniqReleases,function(ur){
            return ur.name;
        });
        var fields = [
            {name: 'project'},
            {name: 'key'},
        ];
        _.each(releaseColumns,function(rc){
            fields.push(rc);
        })

        var store = new Ext.data.ArrayStore({
            fields: fields
        });
        store.loadData(_.filter(rows,function(row){
            return _.contains(keys,row.key)
        }));

        var gridColumns = [
            { header: "Project", sortable: true, dataIndex: 'project'},
            { header: "Key", sortable: true, dataIndex: 'key'}
        ];

        _.each(releaseColumns,function(rc){
            gridColumns.push( {
                header : rc,
                dataIndex : rc
            } );
        });

        var grid = new Ext.grid.GridPanel({
            store: store,
            columns: gridColumns,
            stripeRows: true,
            title:'Program Release Metrics',
        });

        var charts = that._createCharts(_.filter(rows,function(row){
            return _.contains(keys,row.key)
        }),keys,releaseColumns);

        // return [grid].concat(charts);
        return charts.concat(grid);
    },

    _transposeJson : function ( data, rowKey, cols, rowLabel ) {
        // turns cols into rows
        var uniqRowKeys = _.uniq(_.map(data,function(d) { return d[rowKey]}));
        var rows = [];

        _.each(cols,function(col) {
            var row = {};
            row[rowLabel] = col;
            _.each(uniqRowKeys,function(colKey) {
                var rowKeyRows = _.filter(data,function(d){ return d[rowKey]===colKey});
                _.each(rowKeyRows,function(rowKeyRow){
                    row[colKey] = rowKeyRow[col]
                })
            })
            rows.push(row)
        })
        return { rows : rows, rowKeys : uniqRowKeys };
    },


    _createCharts : function(rows,keys,releaseColumns) {

        var that = this;
        var ytitle = '';
        var charts = [];

        switch(keys[0]) {
            case 'PlannedCount' : ytitle = 'Count'; break;
            case 'Planned PE' : ytitle = 'Preliminary Estimate'; break;
            case 'Planned Points' : ytitle = 'Points'; break;
        }


        // group the rows by project
        var projectRows = _.groupBy( rows, function(row) { return row.project; });

        _.each(_.keys(projectRows),function(project) {
            var prs = projectRows[project];
            var data = that._transposeJson(prs,"key",releaseColumns,"release");
            var fields = ['release'].concat(data.rowKeys);
            var store = Ext.create('Ext.data.JsonStore', {
                fields : fields,
                data : data.rows
            })
            var chart = Ext.create("Ext.chart.Chart", that._createChartConfig(
                store, data.rowKeys, 'release', project, ytitle
            ));
            // that.add(chart);
            // charts.push(chart);
            // that.add(chart);
            if (charts.length==0) { // first chart, add it to a full width container
                charts.push(
                    Ext.create('Ext.Container', {
                        "xtype": "container",
                        "layout":
                        {
                           "type": "vbox",
                           "align": "stretch"
                        },
                    // "height": "100%",
                    "items": [chart]
                }));
            } else {
                charts.push(chart);
            }
        })
        return charts;

    },

    _createChartConfig : function(store,fields,labelField,xtitle,ytitle) {
        return {
            // renderTo: Ext.getBody(),
            theme:'ColumnTheme',    
            width: 300,
            height: 300,
            animate: true,
            store: store,
            axes: [{
                type: 'Numeric',
                position: 'left',
                fields: fields,
                label: {
                    renderer: Ext.util.Format.numberRenderer('0,0')
                },
                title: ytitle,
                labelTitle: { font: '11px Arial' },
                grid: true,
                minimum: 0
            }, {
                type: 'Category',
                position: 'bottom',
                fields: [labelField],
                title: xtitle
                // labelTitle: { font: '9px Arial' }

            }],
            series: [{
                type: 'column',
                axis: 'left',
                // highlight: true,
                xField: labelField,
                yField: fields
            }]
        }
    },

    _getIterationDateForRelease : function(release) {
        var that = this;
        // filter iterations to ones ending within release
        var iterations = _.filter(that.bundle.iterations,function(iteration) {
            return iteration.get("EndDate") >= release.get("ReleaseStartDate") &&
                iteration.get("EndDate") <= release.get("ReleaseDate");
        })
        iterations = _.sortBy(iterations,function(i){ return i.get("EndDate")});
        return _.first(iterations);
    },

    uniqSnapshots : function(snapshots) {

        // returns the last snapshot for each group by ObjectID.

        var gSnapshots = _.groupBy(snapshots, function(s) {
            return s["ObjectID"];
        });

        var lSnapshots = _.map( _.keys(gSnapshots), function(key){
            var s = _.sortBy( gSnapshots[key], function(s) { 
                return s["_ValidFrom"];
            });
            return _.last(s);
        })

        console.log(_.map(lSnapshots,function(s){
            return s.FormattedID;
        }))
        return lSnapshots;

    },

    _asyncLoadSnapshotsForReleaseDate : function(req,callback) {

        var that = this;
        var dt = null;

        if (req.start) {
            var release = _.first(req.logicalRelease.releases);
            var iteration = that._getIterationDateForRelease(release);
            if (iteration)
                dt = iteration.get("EndDate"); // iteration.raw.EndDate;
            else
                dt = release.get("ReleaseStartDate"); // release.raw.ReleaseStartDate;

            dt = Rally.util.DateTime.toIsoString(dt, false);
        } else {
            dt = _.first(req.logicalRelease.releases).raw.ReleaseDate
        }

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                refresh: function(store) {
                    var snapshots = [];
                    for (var i = 0, ii = store.getTotalCount(); i < ii; ++i) {
                        snapshots.push(store.getAt(i).data);
                    }
                    // uniquefy the snapshots.
                    snapshots = that.uniqSnapshots(snapshots);
                    if (_.isUndefined(req.logicalRelease.snapshots)) 
                        req.logicalRelease.snapshots = {}
                    if (req.start)
                        req.logicalRelease.snapshots.start = snapshots
                    else {
                        req.logicalRelease.snapshots.end = snapshots
                        // set the completed snapshots
                        req.logicalRelease.snapshots.completed = _.filter( snapshots, function(ss) {
                            // return ss.PercentDoneByStoryCount == 1;
                            return !_.isUndefined(ss.ActualEndDate) && !_.isNull(ss.ActualEndDate) && ss.ActualEndDate != ""
                        })
                    }
                    callback(null,req)
                }
            },
            fetch: ["Name","FormattedID","PreliminaryEstimate","Release",
                    "LeafStoryPlanEstimateTotal","PercentDoneByStoryCount",
                    "PercentDoneByStoryPlanEstimate","LeafStoryCount","ActualEndDate"],
            find: {
                "_TypeHierarchy" : { "$in" : [_.first(that.bundle.piTypes).get("TypePath")] },
                "Release" : { "$in" : _.map(req.logicalRelease.releases,function(r){return r.get("ObjectID");})},
                "_ValidFrom" :  { "$lt" : dt },
                "_ValidTo" : {"$gt": dt}
                // "$or" : [
                //     {"_ValidTo" : {"$gt": dt}},
                //     {"_ValidTo" : "9999-01-01T00:00:00.000Z"}
                // ]
            }                
        });
        // return deferred.getPromise();
    },

    _loadSnapshotsForReleaseDate : function(start, logicalRelease) {

        var that = this;
        var deferred = new Deft.Deferred();
        var dt = (start) ? _.first(logicalRelease.releases).raw.ReleaseStartDate
            : _.first(logicalRelease.releases).raw.ReleaseDate

        if (!start) {
            if (_.first(logicalRelease.releases).get("ReleaseStartDate") < (new Date())) {
                if (_.first(logicalRelease.releases).get("ReleaseDate") > (new Date())) {
                    dt = Rally.util.DateTime.toIsoString(new Date(), false);
                }
            }
        }

        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad : true,
            limit: Infinity,
            listeners: {
                refresh: function(store) {
                    var snapshots = [];
                    for (var i = 0, ii = store.getTotalCount(); i < ii; ++i) {
                        snapshots.push(store.getAt(i).data);
                    }
                    if (_.isUndefined(logicalRelease.snapshots)) 
                        logicalRelease.snapshots = {}
                    if (start)
                        logicalRelease.snapshots.start = snapshots
                    else
                        logicalRelease.snapshots.end = snapshots

                    deferred.resolve(logicalRelease);
                }
            },
            fetch: ["Name","FormattedID","PreliminaryEstimate","Release"],
            find: {
                "_TypeHierarchy" : { "$in" : [_.first(that.bundle.piTypes).get("TypePath")] },
                "Release" : { "$in" : _.map(logicalRelease.releases,function(r){return r.get("ObjectID");})},
                "_ValidFrom" :  { "$lt" : dt },
                "_ValidTo" : {"$gt": dt}
                // "$or" : [
                //     {"_ValidTo" : {"$gt": dt}},
                //     {"_ValidTo" : "9999-01-01T00:00:00.000Z"}
                // ]
            }                
        });
        return deferred.getPromise();
    }
});
